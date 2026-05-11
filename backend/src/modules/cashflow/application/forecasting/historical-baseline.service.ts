import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';
import { RecurringFlow } from './recurring-detector.service';

const DAYS_PER_MONTH = 30.44;

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

  async compute(
    userId: string,
    windowDays = 90,
    recurring: RecurringFlow[] = [],
  ): Promise<DailyDistribution> {
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

    // Build per-calendar-day arrays over the full window. Days with no
    // matching transaction get an explicit 0 — otherwise mean/std collapse
    // to "mean per transaction-day" which is a conditional expectation
    // and overestimates the per-day cashflow when inflow/outflow days are
    // sparse (e.g. salary lands on ~2 days/month → meanInflowDaily would
    // be ~15× the true per-calendar-day mean).
    const dowSum = new Array(7).fill(0);
    const dowDays = new Array(7).fill(0);
    const outflowPerDay: number[] = new Array(windowDays).fill(0);
    const inflowPerDay: number[] = new Array(windowDays).fill(0);
    for (let i = 0; i < windowDays; i++) {
      const day = dayjs(since).add(i, 'day');
      const dayKey = day.format('YYYY-MM-DD');
      const dow = day.day();
      const out = dailyOutflow.get(dayKey) ?? 0;
      const inn = dailyInflow.get(dayKey) ?? 0;
      outflowPerDay[i] = out;
      inflowPerDay[i] = inn;
      dowSum[dow] += out;
      dowDays[dow] += 1;
    }
    // Subtract recurring patterns' expected daily contribution. In this
    // codebase `is_recurring` is rarely set on raw transactions, so without
    // this step the recurring inflows/outflows would be counted twice:
    // once in the baseline distribution and once as the deterministic
    // schedule added by MonteCarloSimulator.scheduleRecurring.
    const dailyInflowFromRecurring = recurring
      .filter((f) => f.sign === 'INFLOW')
      .reduce((s, f) => s + f.amountMonthly / DAYS_PER_MONTH, 0);
    const dailyOutflowFromRecurring = recurring
      .filter((f) => f.sign === 'OUTFLOW')
      .reduce((s, f) => s + f.amountMonthly / DAYS_PER_MONTH, 0);
    if (dailyInflowFromRecurring > 0 || dailyOutflowFromRecurring > 0) {
      for (let i = 0; i < windowDays; i++) {
        inflowPerDay[i] = Math.max(0, inflowPerDay[i] - dailyInflowFromRecurring);
        outflowPerDay[i] = Math.max(0, outflowPerDay[i] - dailyOutflowFromRecurring);
      }
      // dowSum was computed before the subtraction, recompute from corrected outflows.
      for (let i = 0; i < 7; i++) dowSum[i] = 0;
      for (let i = 0; i < windowDays; i++) {
        const dow = dayjs(since).add(i, 'day').day();
        dowSum[dow] += outflowPerDay[i];
      }
    }
    const meanByDow = dowSum.map((sum, i) => (dowDays[i] > 0 ? sum / dowDays[i] : 0));

    return {
      meanByDow,
      stdDaily: this.stddev(outflowPerDay),
      meanInflowDaily: this.mean(inflowPerDay),
      stdInflowDaily: this.stddev(inflowPerDay),
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
