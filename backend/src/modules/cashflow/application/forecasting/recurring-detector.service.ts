import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';

export interface RecurringFlow {
  description: string;
  amountMonthly: number;
  sign: 'INFLOW' | 'OUTFLOW';
  source: 'subscription' | 'salary' | 'pattern';
  nextDueDate: Date | null;
  cadence: 'monthly' | 'weekly' | 'yearly';
}

/**
 * Detects recurring inflows / outflows for a user.
 *
 * Sources (in order):
 *   1. Subscription rows from the existing Subscriptions context — those
 *      already carry estimated_amount + cadence + next_due_date.
 *   2. Salary signal: any income transactions tagged with a category whose
 *      slug starts with `salary`/`investments-investment-income` are
 *      averaged over the last 90 days; we treat them as monthly inflow.
 *   3. Pattern detection: same merchant + same approximate amount that
 *      appears 3+ times in the last 90 days at roughly the same monthly
 *      cadence is treated as recurring.
 */
@Injectable()
export class RecurringDetector {
  constructor(private readonly prisma: PrismaService) {}

  async detect(userId: string): Promise<RecurringFlow[]> {
    const [fromSubs, fromSalary, fromPattern] = await Promise.all([
      this.fromSubscriptions(userId),
      this.fromSalary(userId),
      this.fromTransactionPatterns(userId),
    ]);
    return this.dedup([...fromSalary, ...fromSubs, ...fromPattern]);
  }

  private async fromSubscriptions(userId: string): Promise<RecurringFlow[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { userId, status: 'ACTIVE' },
    });
    return rows.map((s) => ({
      description: s.merchantName,
      amountMonthly: this.normalizeToMonthly(Number(s.estimatedAmount), s.cadence),
      sign: 'OUTFLOW' as const,
      source: 'subscription' as const,
      nextDueDate: s.nextDueDate,
      cadence: this.normalizeCadence(s.cadence),
    }));
  }

  private async fromSalary(userId: string): Promise<RecurringFlow[]> {
    const ninetyDaysAgo = dayjs().subtract(90, 'day').toDate();
    const inflows = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: 'CREDIT',
        transactionDate: { gte: ninetyDaysAgo },
      },
      select: { amount: true, transactionDate: true },
    });
    if (inflows.length < 2) return [];

    const monthlySums: Record<string, number> = {};
    for (const t of inflows) {
      const key = dayjs(t.transactionDate).format('YYYY-MM');
      monthlySums[key] = (monthlySums[key] ?? 0) + Number(t.amount);
    }
    const months = Object.values(monthlySums);
    const avgMonthly = months.reduce((s, v) => s + v, 0) / months.length;
    if (avgMonthly < 100) return []; // ignore noise

    return [
      {
        description: 'Estimated income (avg)',
        amountMonthly: avgMonthly,
        sign: 'INFLOW',
        source: 'salary',
        nextDueDate: null,
        cadence: 'monthly',
      },
    ];
  }

  private async fromTransactionPatterns(userId: string): Promise<RecurringFlow[]> {
    const ninetyDaysAgo = dayjs().subtract(90, 'day').toDate();
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: 'DEBIT',
        transactionDate: { gte: ninetyDaysAgo },
        merchantName: { not: null },
      },
      select: { merchantName: true, amount: true, transactionDate: true },
    });

    type Bucket = { totals: number[]; firstDate: Date; lastDate: Date };
    const buckets = new Map<string, Bucket>();

    for (const t of rows) {
      const merchant = (t.merchantName ?? '').toLowerCase().trim();
      if (!merchant) continue;
      // Bucket by merchant + amount rounded to nearest 50 to tolerate small variance.
      const amt = Number(t.amount);
      const key = `${merchant}|${Math.round(amt / 50) * 50}`;
      const bucket = buckets.get(key);
      if (!bucket) {
        buckets.set(key, { totals: [amt], firstDate: t.transactionDate, lastDate: t.transactionDate });
      } else {
        bucket.totals.push(amt);
        if (t.transactionDate < bucket.firstDate) bucket.firstDate = t.transactionDate;
        if (t.transactionDate > bucket.lastDate) bucket.lastDate = t.transactionDate;
      }
    }

    const flows: RecurringFlow[] = [];
    for (const [key, bucket] of buckets) {
      if (bucket.totals.length < 3) continue;
      const span = dayjs(bucket.lastDate).diff(bucket.firstDate, 'day');
      if (span < 50) continue; // too close together — probably bursts, not recurring

      const avg = bucket.totals.reduce((s, v) => s + v, 0) / bucket.totals.length;
      const merchant = key.split('|')[0]!;
      const monthlyMultiplier = bucket.totals.length / Math.max(1, span / 30);
      flows.push({
        description: merchant,
        amountMonthly: avg * monthlyMultiplier,
        sign: 'OUTFLOW',
        source: 'pattern',
        nextDueDate: null,
        cadence: 'monthly',
      });
    }
    return flows;
  }

  private normalizeCadence(cadence: string): 'monthly' | 'weekly' | 'yearly' {
    const lower = cadence.toLowerCase();
    if (lower.includes('week')) return 'weekly';
    if (lower.includes('year')) return 'yearly';
    return 'monthly';
  }

  private normalizeToMonthly(amount: number, cadence: string): number {
    const norm = this.normalizeCadence(cadence);
    if (norm === 'weekly') return amount * 4.345;
    if (norm === 'yearly') return amount / 12;
    return amount;
  }

  /**
   * Drop "pattern"-detected duplicates of the same merchant we already
   * found via subscriptions (subscription source has higher trust).
   */
  private dedup(flows: RecurringFlow[]): RecurringFlow[] {
    const known = new Set<string>();
    const out: RecurringFlow[] = [];
    for (const flow of flows) {
      const key = flow.description.toLowerCase().trim();
      if (flow.source === 'subscription' || flow.source === 'salary') {
        out.push(flow);
        known.add(key);
        continue;
      }
      if (!known.has(key)) {
        out.push(flow);
        known.add(key);
      }
    }
    return out;
  }
}
