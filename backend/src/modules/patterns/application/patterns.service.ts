import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RedisService } from '../../../redis/redis.service';
import { PatternsRepository } from '../infrastructure/patterns.repository';
import { PatternsQueryDto } from '../presentation/dto/patterns-query.dto';
import {
  RegularPayment,
  Subscription,
  RecurringExpense,
  MonthPeriodBehavior,
  FinancialHabits,
  TimeOfDayDistribution,
} from '../domain/pattern.interfaces';

const TTL = {
  regularPayments: 1800,
  subscriptions: 1800,
  recurringExpenses: 1200,
  monthPeriod: 3600,
  habits: 3600,
};

const FREQUENCY_MAP: { min: number; max: number; label: Subscription['frequency'] }[] = [
  { min: 5, max: 10, label: 'weekly' },
  { min: 11, max: 18, label: 'biweekly' },
  { min: 19, max: 45, label: 'monthly' },
  { min: 46, max: 120, label: 'quarterly' },
  { min: 121, max: 370, label: 'yearly' },
];

const SLOT_META: {
  slot: TimeOfDayDistribution['slot'];
  slotLabel: string;
  hourRange: string;
}[] = [
  { slot: 'morning', slotLabel: 'Ранок', hourRange: '06:00–11:59' },
  { slot: 'afternoon', slotLabel: 'День', hourRange: '12:00–17:59' },
  { slot: 'evening', slotLabel: 'Вечір', hourRange: '18:00–22:59' },
  { slot: 'night', slotLabel: 'Ніч', hourRange: '23:00–05:59' },
];

const PERIOD_META: {
  period: MonthPeriodBehavior['period'];
  periodLabel: string;
  dayRange: string;
}[] = [
  { period: 'beginning', periodLabel: 'Початок місяця', dayRange: '1–10' },
  { period: 'middle', periodLabel: 'Середина місяця', dayRange: '11–20' },
  { period: 'end', periodLabel: 'Кінець місяця', dayRange: '21–31' },
];

@Injectable()
export class PatternsService {
  constructor(
    private readonly repo: PatternsRepository,
    private readonly redis: RedisService,
  ) {}

  /* ── Cache helpers (same pattern as analytics) ─────────────────────────── */

  private async cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as T;
    const result = await fn();
    await this.redis.set(key, JSON.stringify(result), ttl);
    return result;
  }

  private key(endpoint: string, userId: string, params: Record<string, unknown>): string {
    const stable = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v ?? ''}`)
      .join(':');
    return `patterns:${endpoint}:${userId}:${stable}`;
  }

  /* ════════════════════════════════════════════════════════════════════════
     1. REGULAR PAYMENTS
     ════════════════════════════════════════════════════════════════════════ */

  async regularPayments(userId: string, query: PatternsQueryDto): Promise<RegularPayment[]> {
    const { from, to, accountId, minOccurrences = 3 } = query;
    const cacheKey = this.key('regular-payments', userId, { from, to, accountId, minOccurrences });

    return this.cached(cacheKey, TTL.regularPayments, async () => {
      const rows = await this.repo.regularPayments(
        userId,
        minOccurrences,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      );

      return rows.map((r) => {
        const avgInterval = Number(r.avg_interval);
        const stdInterval = Number(r.std_interval);
        const cv = avgInterval > 0 ? stdInterval / avgInterval : 1;
        const confidence = Math.max(0, Math.min(1, 1 - cv));

        const lastSeen = new Date(r.last_seen);
        const nextDate = new Date(lastSeen.getTime() + avgInterval * 86400000);

        return {
          merchant: r.merchant,
          category: r.category,
          avgAmount: new Prisma.Decimal(r.avg_amount).toFixed(2),
          minAmount: new Prisma.Decimal(r.min_amount).toFixed(2),
          maxAmount: new Prisma.Decimal(r.max_amount).toFixed(2),
          avgIntervalDays: Math.round(avgInterval),
          stdIntervalDays: Math.round(stdInterval * 10) / 10,
          transactionCount: r.tx_count,
          firstSeen: new Date(r.first_seen).toISOString().slice(0, 10),
          lastSeen: lastSeen.toISOString().slice(0, 10),
          nextExpectedDate: nextDate.toISOString().slice(0, 10),
          confidence: Math.round(confidence * 100) / 100,
        };
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     2. SUBSCRIPTIONS
     ════════════════════════════════════════════════════════════════════════ */

  async subscriptions(userId: string, query: PatternsQueryDto): Promise<Subscription[]> {
    const { from, to, accountId, minOccurrences = 3 } = query;
    const cacheKey = this.key('subscriptions', userId, { from, to, accountId, minOccurrences });

    return this.cached(cacheKey, TTL.subscriptions, async () => {
      const rows = await this.repo.subscriptions(
        userId,
        minOccurrences,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      );

      const now = new Date();

      return rows.map((r) => {
        const avgInterval = Number(r.avg_interval);
        const lastSeen = new Date(r.last_seen);
        const daysSinceLast = (now.getTime() - lastSeen.getTime()) / 86400000;
        const isActive = daysSinceLast < avgInterval * 2;

        const frequency =
          FREQUENCY_MAP.find((f) => avgInterval >= f.min && avgInterval <= f.max)?.label ?? 'monthly';

        const nextDate = isActive
          ? new Date(lastSeen.getTime() + avgInterval * 86400000)
          : null;

        return {
          merchant: r.merchant,
          category: r.category,
          amount: new Prisma.Decimal(r.avg_amount).toFixed(2),
          frequency,
          intervalDays: Math.round(avgInterval),
          firstSeen: new Date(r.first_seen).toISOString().slice(0, 10),
          lastSeen: lastSeen.toISOString().slice(0, 10),
          nextExpectedDate: nextDate?.toISOString().slice(0, 10) ?? null,
          isActive,
          transactionCount: r.tx_count,
          totalSpent: new Prisma.Decimal(r.total_spent).toFixed(2),
        };
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     3. RECURRING EXPENSES
     ════════════════════════════════════════════════════════════════════════ */

  async recurringExpenses(userId: string, query: PatternsQueryDto): Promise<RecurringExpense[]> {
    const { from, to, accountId, minOccurrences = 3 } = query;
    const cacheKey = this.key('recurring-expenses', userId, { from, to, accountId, minOccurrences });

    return this.cached(cacheKey, TTL.recurringExpenses, async () => {
      const rows = await this.repo.recurringExpenses(
        userId,
        minOccurrences,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      );

      return rows.map((r) => {
        const avgInterval = Number(r.avg_interval);
        const stdInterval = Number(r.std_interval);
        const cv = avgInterval > 0 ? stdInterval / avgInterval : 1;
        const regularityScore = Math.max(0, Math.min(1, 1 - cv));

        return {
          merchant: r.merchant,
          category: r.category,
          occurrences: r.occurrences,
          avgAmount: new Prisma.Decimal(r.avg_amount).toFixed(2),
          totalSpent: new Prisma.Decimal(r.total_spent).toFixed(2),
          regularityScore: Math.round(regularityScore * 100) / 100,
          avgIntervalDays: Math.round(avgInterval),
          lastDate: new Date(r.last_date).toISOString().slice(0, 10),
        };
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     4. MONTH-PERIOD BEHAVIOR
     ════════════════════════════════════════════════════════════════════════ */

  async monthPeriodBehavior(
    userId: string,
    query: PatternsQueryDto,
  ): Promise<MonthPeriodBehavior[]> {
    const { from, to, accountId } = query;
    const cacheKey = this.key('month-period', userId, { from, to, accountId });

    return this.cached(cacheKey, TTL.monthPeriod, async () => {
      const [periodRows, catRows] = await Promise.all([
        this.repo.monthPeriodSpending(
          userId,
          from ? new Date(from) : undefined,
          to ? new Date(to) : undefined,
          accountId,
        ),
        this.repo.monthPeriodTopCategories(
          userId,
          from ? new Date(from) : undefined,
          to ? new Date(to) : undefined,
          accountId,
        ),
      ]);

      const catMap = new Map<number, { category: string; total: string }[]>();
      for (const c of catRows) {
        const list = catMap.get(c.period) ?? [];
        list.push({ category: c.category, total: new Prisma.Decimal(c.total).toFixed(2) });
        catMap.set(c.period, list);
      }

      return periodRows.map((r) => {
        const meta = PERIOD_META[r.period - 1];
        const months = r.months_count || 1;
        return {
          period: meta.period,
          periodLabel: meta.periodLabel,
          dayRange: meta.dayRange,
          avgSpending: new Prisma.Decimal(r.total_spending).div(months).toFixed(2),
          totalSpending: new Prisma.Decimal(r.total_spending).toFixed(2),
          transactionCount: r.tx_count,
          avgTransactionAmount: new Prisma.Decimal(r.avg_tx_amount).toFixed(2),
          topCategories: catMap.get(r.period) ?? [],
        };
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     5. FINANCIAL HABITS
     ════════════════════════════════════════════════════════════════════════ */

  async financialHabits(userId: string, query: PatternsQueryDto): Promise<FinancialHabits> {
    const { from, to, accountId } = query;
    const cacheKey = this.key('habits', userId, { from, to, accountId });

    return this.cached(cacheKey, TTL.habits, async () => {
      const dateFrom = from ? new Date(from) : undefined;
      const dateTo = to ? new Date(to) : undefined;

      const [wwRows, todRows, monthly, large, stable, activity] = await Promise.all([
        this.repo.weekdayWeekendSpending(userId, dateFrom, dateTo, accountId),
        this.repo.timeOfDaySpending(userId, dateFrom, dateTo, accountId),
        this.repo.monthlyIncomeExpense(userId, dateFrom, dateTo, accountId),
        this.repo.largeTransactions(userId, dateFrom, dateTo, accountId),
        this.repo.stableCategories(userId, dateFrom, dateTo, accountId),
        this.repo.dailyActivity(userId, dateFrom, dateTo, accountId),
      ]);

      // weekday/weekend
      const weekday = wwRows.find((r) => !r.is_weekend);
      const weekend = wwRows.find((r) => r.is_weekend);
      const weekdayAvg =
        weekday && weekday.day_count > 0
          ? new Prisma.Decimal(weekday.total_spending).div(weekday.day_count)
          : new Prisma.Decimal(0);
      const weekendAvg =
        weekend && weekend.day_count > 0
          ? new Prisma.Decimal(weekend.total_spending).div(weekend.day_count)
          : new Prisma.Decimal(0);
      const ratio = weekdayAvg.isZero()
        ? '0.00'
        : weekendAvg.div(weekdayAvg).toFixed(2);

      // time-of-day
      const todTotal = todRows.reduce(
        (s, r) => s.add(new Prisma.Decimal(r.total_spending)),
        new Prisma.Decimal(0),
      );
      const timeOfDay: TimeOfDayDistribution[] = todRows.map((r) => {
        const meta = SLOT_META[Number(r.slot)];
        const total = new Prisma.Decimal(r.total_spending);
        return {
          slot: meta.slot,
          slotLabel: meta.slotLabel,
          hourRange: meta.hourRange,
          totalSpending: total.toFixed(2),
          transactionCount: r.tx_count,
          avgAmount: new Prisma.Decimal(r.avg_amount).toFixed(2),
          percent: todTotal.isZero() ? '0.00' : total.div(todTotal).mul(100).toFixed(2),
        };
      });

      // savings
      const avgIncome = new Prisma.Decimal(monthly.avg_income);
      const avgExpense = new Prisma.Decimal(monthly.avg_expense);
      const savingsRate = avgIncome.isZero()
        ? '0.00'
        : avgIncome.sub(avgExpense).div(avgIncome).mul(100).toFixed(2);

      // large transactions
      const threshold = new Prisma.Decimal(large.threshold);
      const largePercent =
        large.total_count > 0
          ? new Prisma.Decimal(large.large_count).div(large.total_count).mul(100).toFixed(2)
          : '0.00';

      return {
        weekdayAvgSpend: weekdayAvg.toFixed(2),
        weekendAvgSpend: weekendAvg.toFixed(2),
        weekendToWeekdayRatio: ratio,
        timeOfDay,
        avgMonthlyIncome: avgIncome.toFixed(2),
        avgMonthlyExpense: avgExpense.toFixed(2),
        savingsRate,
        avgTransactionsPerDay: new Prisma.Decimal(activity.avgPerDay).toFixed(1),
        mostActiveDay: activity.mostActive,
        leastActiveDay: activity.leastActive,
        largeTransactionThreshold: threshold.toFixed(2),
        largeTransactionCount: large.large_count,
        largeTransactionPercent: largePercent,
        topStableCategories: stable.map((s) => ({
          category: s.category,
          monthsPresent: s.months_present,
          avgMonthlySpend: new Prisma.Decimal(s.avg_monthly_spend).toFixed(2),
        })),
      };
    });
  }
}
