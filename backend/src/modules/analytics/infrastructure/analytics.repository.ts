import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface SpendingByCategoryRow {
  category: string;
  total: string;
  count: number;
  percent: string;
}

export interface MonthlyTrendRow {
  year: number;
  month: number;
  totalExpense: string;
  totalIncome: string;
  net: string;
}

export interface IncomeVsExpenseRow {
  period: string;
  income: string;
  expense: string;
  net: string;
}

export interface TopCategoryRow {
  rank: number;
  category: string;
  total: string;
  count: number;
  avgAmount: string;
  percent: string;
}

export interface PeriodComparisonRow {
  category: string;
  period1Total: string;
  period2Total: string;
  change: string;
  changePercent: string | null;
}

export interface SpendingTrendRow {
  date: string;
  amount: string;
  movingAvg: string;
}

export interface AverageTransactionRow {
  category: string;
  avg: string;
  min: string;
  max: string;
  count: number;
}

export interface DayOfWeekRow {
  dayOfWeek: number;
  dayName: string;
  avgAmount: string;
  totalAmount: string;
  count: number;
}

export interface SummaryRow {
  thisMonthExpense: string;
  lastMonthExpense: string;
  thisMonthIncome: string;
  totalCashback: string;
  topCategory: string | null;
  avgDailySpend: string;
}

export interface TopMerchantRow {
  merchant: string;
  total: string;
  count: number;
  avgAmount: string;
}

export interface IncomeSummaryRow {
  totalIncome: string;
  transactionCount: number;
  averageAmount: string;
  topSources: { source: string; total: string; count: number }[];
  byMonth: { year: number; month: number; total: string; count: number }[];
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Spending by category (Prisma groupBy)
  // ──────────────────────────────────────────────────────────────────────────

  async spendingByCategory(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<SpendingByCategoryRow[]> {
    const where: Prisma.TransactionWhereInput = {
      userId,
      transactionType: 'DEBIT',
      ...(from || to ? { transactionTime: { gte: from, lte: to } } : {}),
      ...(accountId ? { accountId } : {}),
    };

    // DEBIT amounts are negative — `asc` on the signed sum gives
    // largest-spend first (i.e. most-negative first).
    const grouped = await this.prisma.transaction.groupBy({
      by: ['mccCategory'],
      where,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'asc' } },
    });

    // DEBIT amounts are stored as negative; ABS for display so consumers
    // and the AI assistant see positive expense totals.
    const grandTotal = grouped.reduce(
      (sum, g) => sum.add((g._sum.amount ?? new Prisma.Decimal(0)).abs()),
      new Prisma.Decimal(0),
    );

    return grouped.map((g) => {
      const total = (g._sum.amount ?? new Prisma.Decimal(0)).abs();
      return {
        category: g.mccCategory ?? 'Uncategorized',
        total: total.toFixed(2),
        count: g._count.id,
        percent: grandTotal.isZero()
          ? '0.00'
          : total.div(grandTotal).mul(100).toFixed(2),
      };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Monthly trend (raw SQL — needs DATE_TRUNC)
  // ──────────────────────────────────────────────────────────────────────────

  async monthlyTrend(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<MonthlyTrendRow[]> {
    const fromFilter = from
      ? Prisma.sql`AND transaction_time >= ${from}`
      : Prisma.sql``;
    const toFilter = to
      ? Prisma.sql`AND transaction_time <= ${to}`
      : Prisma.sql``;
    const acctFilter = accountId
      ? Prisma.sql`AND account_id = ${accountId}::uuid`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<
      {
        year: number;
        month: number;
        totalExpense: string;
        totalIncome: string;
        net: string;
      }[]
    >`
      SELECT
        EXTRACT(YEAR  FROM DATE_TRUNC('month', transaction_time))::int AS year,
        EXTRACT(MONTH FROM DATE_TRUNC('month', transaction_time))::int AS month,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE transaction_type = 'DEBIT'),  0)::numeric AS "totalExpense",
        COALESCE(SUM(amount)      FILTER (WHERE transaction_type = 'CREDIT'), 0)::numeric AS "totalIncome",
        COALESCE(SUM(CASE
          WHEN transaction_type = 'CREDIT' THEN  amount
          WHEN transaction_type = 'DEBIT'  THEN -ABS(amount)
          ELSE 0
        END), 0)::numeric AS net
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND transaction_type IN ('DEBIT', 'CREDIT')
        ${fromFilter}
        ${toFilter}
        ${acctFilter}
      GROUP BY DATE_TRUNC('month', transaction_time)
      ORDER BY DATE_TRUNC('month', transaction_time) ASC
    `;

    return rows.map((r) => ({
      year: Number(r.year),
      month: Number(r.month),
      totalExpense: String(r.totalExpense),
      totalIncome: String(r.totalIncome),
      net: String(r.net),
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Income vs expense by granularity (raw SQL)
  // ──────────────────────────────────────────────────────────────────────────

  async incomeVsExpense(
    userId: string,
    granularity: 'day' | 'week' | 'month',
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<IncomeVsExpenseRow[]> {
    // granularity is validated by @IsIn in DTO — safe to use in Prisma.sql array form
    const trunc = Prisma.sql([`DATE_TRUNC('${granularity}', transaction_time)`]);
    const fromFilter = from
      ? Prisma.sql`AND transaction_time >= ${from}`
      : Prisma.sql``;
    const toFilter = to
      ? Prisma.sql`AND transaction_time <= ${to}`
      : Prisma.sql``;
    const acctFilter = accountId
      ? Prisma.sql`AND account_id = ${accountId}::uuid`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<
      { period: Date; income: string; expense: string; net: string }[]
    >`
      SELECT
        ${trunc}::date AS period,
        COALESCE(SUM(amount)      FILTER (WHERE transaction_type = 'CREDIT'), 0)::numeric AS income,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE transaction_type = 'DEBIT'),  0)::numeric AS expense,
        COALESCE(SUM(CASE
          WHEN transaction_type = 'CREDIT' THEN  amount
          WHEN transaction_type = 'DEBIT'  THEN -ABS(amount)
          ELSE 0
        END), 0)::numeric AS net
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND transaction_type IN ('DEBIT', 'CREDIT')
        ${fromFilter}
        ${toFilter}
        ${acctFilter}
      GROUP BY ${trunc}
      ORDER BY ${trunc} ASC
    `;

    return rows.map((r) => ({
      period: r.period instanceof Date ? r.period.toISOString().slice(0, 10) : String(r.period),
      income: String(r.income),
      expense: String(r.expense),
      net: String(r.net),
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Top categories (Prisma groupBy)
  // ──────────────────────────────────────────────────────────────────────────

  async topCategories(
    userId: string,
    limit: number,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<TopCategoryRow[]> {
    const where: Prisma.TransactionWhereInput = {
      userId,
      transactionType: 'DEBIT',
      ...(from || to ? { transactionTime: { gte: from, lte: to } } : {}),
      ...(accountId ? { accountId } : {}),
    };

    const [grouped, totals] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['mccCategory'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        _avg: { amount: true },
        // DEBIT amounts are negative — asc gives largest-spend first.
        orderBy: { _sum: { amount: 'asc' } },
        take: limit,
      }),
      this.prisma.transaction.aggregate({ where, _sum: { amount: true } }),
    ]);

    const grandTotal = (totals._sum.amount ?? new Prisma.Decimal(0)).abs();

    return grouped.map((g, i) => {
      const total = (g._sum.amount ?? new Prisma.Decimal(0)).abs();
      return {
        rank: i + 1,
        category: g.mccCategory ?? 'Uncategorized',
        total: total.toFixed(2),
        count: g._count.id,
        avgAmount: (g._avg.amount ?? new Prisma.Decimal(0)).abs().toFixed(2),
        percent: grandTotal.isZero()
          ? '0.00'
          : total.div(grandTotal).mul(100).toFixed(2),
      };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Period comparison (raw SQL — dual-period in one pass)
  // ──────────────────────────────────────────────────────────────────────────

  async periodComparison(
    userId: string,
    period1From: Date,
    period1To: Date,
    period2From: Date,
    period2To: Date,
    accountId?: string,
  ): Promise<PeriodComparisonRow[]> {
    const acctFilter = accountId
      ? Prisma.sql`AND account_id = ${accountId}::uuid`
      : Prisma.sql``;

    // Explicit ::timestamp casts are required inside LEAST/GREATEST — those
    // are polymorphic, so PostgreSQL defaults the parameter type to `text`
    // and then refuses `timestamp >= text`.
    const rows = await this.prisma.$queryRaw<
      { category: string; period1Total: string; period2Total: string }[]
    >`
      SELECT
        COALESCE(mcc_category, 'Uncategorized') AS category,
        COALESCE(SUM(ABS(amount)) FILTER (
          WHERE transaction_time BETWEEN ${period1From}::timestamp AND ${period1To}::timestamp
        ), 0)::numeric AS "period1Total",
        COALESCE(SUM(ABS(amount)) FILTER (
          WHERE transaction_time BETWEEN ${period2From}::timestamp AND ${period2To}::timestamp
        ), 0)::numeric AS "period2Total"
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND transaction_type = 'DEBIT'
        AND transaction_time BETWEEN
          LEAST(${period1From}::timestamp, ${period2From}::timestamp)
          AND GREATEST(${period1To}::timestamp, ${period2To}::timestamp)
        ${acctFilter}
      GROUP BY mcc_category
      HAVING SUM(ABS(amount)) > 0
      ORDER BY "period2Total" DESC
    `;

    return rows.map((r) => {
      const p1 = new Prisma.Decimal(r.period1Total);
      const p2 = new Prisma.Decimal(r.period2Total);
      const change = p2.sub(p1);
      const changePercent = p1.isZero()
        ? null
        : change.div(p1).mul(100).toFixed(2);

      return {
        category: r.category,
        period1Total: p1.toFixed(2),
        period2Total: p2.toFixed(2),
        change: change.toFixed(2),
        changePercent,
      };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Spending trend with 7-day moving average (raw SQL — window function)
  // ──────────────────────────────────────────────────────────────────────────

  async spendingTrend(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<SpendingTrendRow[]> {
    const fromFilter = from
      ? Prisma.sql`AND transaction_time >= ${from}`
      : Prisma.sql``;
    const toFilter = to
      ? Prisma.sql`AND transaction_time <= ${to}`
      : Prisma.sql``;
    const acctFilter = accountId
      ? Prisma.sql`AND account_id = ${accountId}::uuid`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<
      { date: Date; amount: string; movingAvg: string }[]
    >`
      WITH daily AS (
        SELECT
          DATE_TRUNC('day', transaction_time)::date AS date,
          SUM(ABS(amount))::numeric AS amount
        FROM transactions
        WHERE user_id = ${userId}::uuid
          AND transaction_type = 'DEBIT'
          ${fromFilter}
          ${toFilter}
          ${acctFilter}
        GROUP BY DATE_TRUNC('day', transaction_time)::date
      )
      SELECT
        date,
        amount,
        AVG(amount) OVER (
          ORDER BY date
          ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        )::numeric AS "movingAvg"
      FROM daily
      ORDER BY date ASC
    `;

    return rows.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
      amount: String(r.amount),
      movingAvg: String(r.movingAvg),
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Average transaction by category (Prisma groupBy)
  // ──────────────────────────────────────────────────────────────────────────

  async averageTransaction(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<AverageTransactionRow[]> {
    const where: Prisma.TransactionWhereInput = {
      userId,
      transactionType: 'DEBIT',
      ...(from || to ? { transactionTime: { gte: from, lte: to } } : {}),
      ...(accountId ? { accountId } : {}),
    };

    const grouped = await this.prisma.transaction.groupBy({
      by: ['mccCategory'],
      where,
      _avg: { amount: true },
      _min: { amount: true },
      _max: { amount: true },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // DEBIT amounts are negative, so Prisma's _min is the LARGEST expense and
    // _max is the SMALLEST. Swap so exposed min/max reflect absolute spend.
    return grouped.map((g) => ({
      category: g.mccCategory ?? 'Uncategorized',
      avg: (g._avg.amount ?? new Prisma.Decimal(0)).abs().toFixed(2),
      min: (g._max.amount ?? new Prisma.Decimal(0)).abs().toFixed(2),
      max: (g._min.amount ?? new Prisma.Decimal(0)).abs().toFixed(2),
      count: g._count.id,
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Day of week (raw SQL — EXTRACT)
  // ──────────────────────────────────────────────────────────────────────────

  async dayOfWeek(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<DayOfWeekRow[]> {
    const fromFilter = from
      ? Prisma.sql`AND transaction_time >= ${from}`
      : Prisma.sql``;
    const toFilter = to
      ? Prisma.sql`AND transaction_time <= ${to}`
      : Prisma.sql``;
    const acctFilter = accountId
      ? Prisma.sql`AND account_id = ${accountId}::uuid`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<
      { dow: number; totalAmount: string; avgAmount: string; count: bigint }[]
    >`
      SELECT
        EXTRACT(DOW FROM transaction_time)::int AS dow,
        SUM(ABS(amount))::numeric              AS "totalAmount",
        AVG(ABS(amount))::numeric              AS "avgAmount",
        COUNT(*)                               AS count
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND transaction_type = 'DEBIT'
        ${fromFilter}
        ${toFilter}
        ${acctFilter}
      GROUP BY EXTRACT(DOW FROM transaction_time)
      ORDER BY dow ASC
    `;

    return rows.map((r) => ({
      dayOfWeek: Number(r.dow),
      dayName: DAY_NAMES[Number(r.dow)] ?? 'Unknown',
      totalAmount: String(r.totalAmount),
      avgAmount: String(r.avgAmount),
      count: Number(r.count),
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Summary / KPI cards (raw SQL + groupBy)
  // ──────────────────────────────────────────────────────────────────────────

  async summary(userId: string, accountId?: string): Promise<SummaryRow> {
    const acctFilter = accountId
      ? Prisma.sql`AND account_id = ${accountId}::uuid`
      : Prisma.sql``;

    const [rawResult] = await this.prisma.$queryRaw<
      {
        thisMonthExpense: string;
        lastMonthExpense: string;
        thisMonthIncome: string;
        totalCashback: string;
        daysElapsed: number;
      }[]
    >`
      SELECT
        COALESCE(SUM(ABS(amount)) FILTER (
          WHERE transaction_type = 'DEBIT'
            AND transaction_time >= DATE_TRUNC('month', NOW())
        ), 0)::numeric AS "thisMonthExpense",

        COALESCE(SUM(ABS(amount)) FILTER (
          WHERE transaction_type = 'DEBIT'
            AND transaction_time >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
            AND transaction_time <  DATE_TRUNC('month', NOW())
        ), 0)::numeric AS "lastMonthExpense",

        COALESCE(SUM(amount) FILTER (
          WHERE transaction_type = 'CREDIT'
            AND transaction_time >= DATE_TRUNC('month', NOW())
        ), 0)::numeric AS "thisMonthIncome",

        COALESCE(SUM(cashback_amount), 0)::numeric AS "totalCashback",

        EXTRACT(DAY FROM NOW())::int AS "daysElapsed"

      FROM transactions
      WHERE user_id = ${userId}::uuid
        ${acctFilter}
    `;

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const topCat = await this.prisma.transaction.groupBy({
      by: ['mccCategory'],
      where: {
        userId,
        transactionType: 'DEBIT',
        transactionTime: { gte: thisMonthStart },
        ...(accountId ? { accountId } : {}),
      },
      _sum: { amount: true },
      // DEBIT amounts are negative — asc = largest absolute spend first.
      orderBy: { _sum: { amount: 'asc' } },
      take: 1,
    });

    const expense = new Prisma.Decimal(rawResult.thisMonthExpense);
    const days = rawResult.daysElapsed > 0 ? rawResult.daysElapsed : 1;

    return {
      thisMonthExpense: expense.toFixed(2),
      lastMonthExpense: new Prisma.Decimal(rawResult.lastMonthExpense).toFixed(2),
      thisMonthIncome: new Prisma.Decimal(rawResult.thisMonthIncome).toFixed(2),
      totalCashback: new Prisma.Decimal(rawResult.totalCashback).toFixed(2),
      topCategory: topCat[0]?.mccCategory ?? null,
      avgDailySpend: expense.div(days).toFixed(2),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Top merchants (Prisma groupBy)
  // ──────────────────────────────────────────────────────────────────────────

  async topMerchants(
    userId: string,
    limit: number,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<TopMerchantRow[]> {
    const where: Prisma.TransactionWhereInput = {
      userId,
      transactionType: 'DEBIT',
      merchantNameClean: { not: null },
      ...(from || to ? { transactionTime: { gte: from, lte: to } } : {}),
      ...(accountId ? { accountId } : {}),
    };

    const grouped = await this.prisma.transaction.groupBy({
      by: ['merchantNameClean'],
      where,
      _sum: { amount: true },
      _count: { id: true },
      _avg: { amount: true },
      // DEBIT amounts are negative — asc = largest absolute spend first.
      orderBy: { _sum: { amount: 'asc' } },
      take: limit,
    });

    return grouped.map((g) => ({
      merchant: g.merchantNameClean!,
      total: (g._sum.amount ?? new Prisma.Decimal(0)).abs().toFixed(2),
      count: g._count.id,
      avgAmount: (g._avg.amount ?? new Prisma.Decimal(0)).abs().toFixed(2),
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 11. Income summary — total, top sources, monthly breakdown
  // ──────────────────────────────────────────────────────────────────────────

  async incomeSummary(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<IncomeSummaryRow> {
    const where: Prisma.TransactionWhereInput = {
      userId,
      transactionType: 'CREDIT',
      ...(from || to ? { transactionTime: { gte: from, lte: to } } : {}),
      ...(accountId ? { accountId } : {}),
    };

    const [agg, sourcesGroup, monthRows] = await Promise.all([
      this.prisma.transaction.aggregate({
        where,
        _sum: { amount: true },
        _avg: { amount: true },
        _count: { id: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['descriptionRaw'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 10,
      }),
      this.prisma.$queryRaw<
        { year: number; month: number; total: string; count: bigint }[]
      >`
        SELECT
          EXTRACT(YEAR  FROM DATE_TRUNC('month', transaction_time))::int AS year,
          EXTRACT(MONTH FROM DATE_TRUNC('month', transaction_time))::int AS month,
          SUM(amount)::numeric AS total,
          COUNT(*) AS count
        FROM transactions
        WHERE user_id = ${userId}::uuid
          AND transaction_type = 'CREDIT'
          ${from ? Prisma.sql`AND transaction_time >= ${from}` : Prisma.sql``}
          ${to ? Prisma.sql`AND transaction_time <= ${to}` : Prisma.sql``}
          ${accountId ? Prisma.sql`AND account_id = ${accountId}::uuid` : Prisma.sql``}
        GROUP BY DATE_TRUNC('month', transaction_time)
        ORDER BY DATE_TRUNC('month', transaction_time) ASC
      `,
    ]);

    return {
      totalIncome: (agg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      transactionCount: agg._count.id,
      averageAmount: (agg._avg.amount ?? new Prisma.Decimal(0)).toFixed(2),
      topSources: sourcesGroup.map((s) => ({
        source: s.descriptionRaw,
        total: (s._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
        count: s._count.id,
      })),
      byMonth: monthRows.map((r) => ({
        year: Number(r.year),
        month: Number(r.month),
        total: new Prisma.Decimal(r.total).toFixed(2),
        count: Number(r.count),
      })),
    };
  }
}
