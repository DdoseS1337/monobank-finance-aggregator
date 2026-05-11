import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';

export interface DailyDistribution {
  /** mean discretionary outflow on day-of-week, after recurring is removed */
  meanByDow: number[]; // length 7, index 0 = Sun … 6 = Sat
  /** standard deviation of daily outflow (single number, used for the Brownian noise component) */
  stdDaily: number;
  /** mean discretionary inflow per day */
  meanInflowDaily: number;
  stdInflowDaily: number;
  observations: number;
}

/**
 * Computes per-user daily-cashflow statistics over the last `windowDays`
 * (default 90 days). The forecast layer uses these stats as the random
 * walk component on top of the deterministic recurring schedule.
 *
 * Day-of-week mean lets us reflect real spending rhythms (Friday spikes,
 * weekend drops, etc.) without needing a full time-series model.
 */
@Injectable()
export class HistoricalBaselineService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(userId: string, windowDays = 90): Promise<DailyDistribution> {
    const since = dayjs().subtract(windowDays, 'day').startOf('day').toDate();
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        transactionDate: { gte: since },
      },
      select: { amount: true, type: true, transactionDate: true, isRecurring: true },
    });
    if (rows.length === 0) {
      return {
        meanByDow: new Array(7).fill(0),
        stdDaily: 0,
        meanInflowDaily: 0,
        stdInflowDaily: 0,
        observations: 0,
      };
    }

    const dailyOutflow = new Map<string, number>();
    const dailyInflow = new Map<string, number>();
    for (const tx of rows) {
      // Recurring is handled by RecurringDetector; exclude it here so we
      // don't double-count the deterministic side.
      if (tx.isRecurring) continue;
      const dayKey = dayjs(tx.transactionDate).format('YYYY-MM-DD');
      const amt = Number(tx.amount);
      if (tx.type === 'DEBIT') {
        dailyOutflow.set(dayKey, (dailyOutflow.get(dayKey) ?? 0) + amt);
      } else if (tx.type === 'CREDIT') {
        dailyInflow.set(dayKey, (dailyInflow.get(dayKey) ?? 0) + amt);
      }
    }

    const dowSum = new Array(7).fill(0);
    const dowCount = new Array(7).fill(0);
    const allOutflows: number[] = [];
    for (const [key, amount] of dailyOutflow) {
      const dow = dayjs(key).day();
      dowSum[dow] += amount;
      dowCount[dow] += 1;
      allOutflows.push(amount);
    }
    const meanByDow = dowSum.map((sum, i) => (dowCount[i] > 0 ? sum / dowCount[i] : 0));

    const inflowValues = [...dailyInflow.values()];

    return {
      meanByDow,
      stdDaily: this.stddev(allOutflows),
      meanInflowDaily: this.mean(inflowValues),
      stdInflowDaily: this.stddev(inflowValues),
      observations: rows.length,
    };
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private stddev(values: number[]): number {
    if (values.length < 2) return 0;
    const m = this.mean(values);
    const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }
}
