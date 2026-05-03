import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/* ───────────────────────────────────────────────────────────────────────────
   Internal raw-query row types (DB → service mapping happens in service)
   ─────────────────────────────────────────────────────────────────────────── */

export interface RegularPaymentRow {
  merchant: string;
  category: string | null;
  avg_amount: string;
  min_amount: string;
  max_amount: string;
  avg_interval: number;
  std_interval: number;
  tx_count: number;
  first_seen: Date;
  last_seen: Date;
}

export interface SubscriptionRow {
  merchant: string;
  category: string | null;
  avg_amount: string;
  avg_interval: number;
  tx_count: number;
  total_spent: string;
  first_seen: Date;
  last_seen: Date;
  amount_cv: number; // coefficient of variation for amount
}

export interface RecurringExpenseRow {
  merchant: string;
  category: string | null;
  occurrences: number;
  avg_amount: string;
  total_spent: string;
  avg_interval: number;
  std_interval: number;
  last_date: Date;
}

export interface MonthPeriodRow {
  period: number; // 1=beginning, 2=middle, 3=end
  total_spending: string;
  tx_count: number;
  avg_tx_amount: string;
  months_count: number;
}

export interface MonthPeriodCategoryRow {
  period: number;
  category: string;
  total: string;
}

export interface TimeOfDayRow {
  slot: number; // 0=morning,1=afternoon,2=evening,3=night
  total_spending: string;
  tx_count: number;
  avg_amount: string;
}

export interface WeekdayWeekendRow {
  is_weekend: boolean;
  total_spending: string;
  day_count: number;
}

export interface MonthlyAggRow {
  avg_income: string;
  avg_expense: string;
  months_count: number;
}

export interface LargeTransactionRow {
  threshold: string;
  large_count: number;
  total_count: number;
}

export interface StableCategoryRow {
  category: string;
  months_present: number;
  avg_monthly_spend: string;
}

export interface DailyActivityRow {
  day_name: string;
  avg_count: string;
}

export interface AvgTxPerDayRow {
  avg_per_day: string;
}

@Injectable()
export class PatternsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private filters(from?: Date, to?: Date, accountId?: string) {
    const f = from ? Prisma.sql`AND t.transaction_time >= ${from}` : Prisma.sql``;
    const t = to ? Prisma.sql`AND t.transaction_time <= ${to}` : Prisma.sql``;
    const a = accountId
      ? Prisma.sql`AND t.account_id = ${accountId}::uuid`
      : Prisma.sql``;
    return { fromF: f, toF: t, acctF: a };
  }

  /* ════════════════════════════════════════════════════════════════════════
     1. REGULAR PAYMENTS
     ════════════════════════════════════════════════════════════════════════ */

  async regularPayments(
    userId: string,
    minOccurrences: number,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<RegularPaymentRow[]> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    return this.prisma.$queryRaw<RegularPaymentRow[]>`
      WITH merchant_txns AS (
        SELECT
          COALESCE(t.merchant_name_clean, t.description_raw) AS merchant,
          t.mcc_category AS category,
          ABS(t.amount) AS amt,
          t.transaction_time AS ts
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
      ),
      with_intervals AS (
        SELECT
          merchant,
          category,
          amt,
          ts,
          EXTRACT(EPOCH FROM ts - LAG(ts) OVER (PARTITION BY merchant ORDER BY ts)) / 86400.0 AS interval_days
        FROM merchant_txns
      ),
      merchant_stats AS (
        SELECT
          merchant,
          MAX(category) AS category,
          AVG(amt)::numeric AS avg_amount,
          MIN(amt)::numeric AS min_amount,
          MAX(amt)::numeric AS max_amount,
          AVG(interval_days)::numeric AS avg_interval,
          COALESCE(STDDEV(interval_days), 0)::numeric AS std_interval,
          COUNT(*) AS tx_count,
          MIN(ts) AS first_seen,
          MAX(ts) AS last_seen
        FROM with_intervals
        WHERE interval_days IS NOT NULL
        GROUP BY merchant
        HAVING COUNT(*) >= ${minOccurrences}
          AND AVG(interval_days) > 3
          AND AVG(interval_days) < 400
      )
      SELECT
        merchant,
        category,
        avg_amount,
        min_amount,
        max_amount,
        avg_interval::float AS avg_interval,
        std_interval::float AS std_interval,
        tx_count::int AS tx_count,
        first_seen,
        last_seen
      FROM merchant_stats
      ORDER BY std_interval / NULLIF(avg_interval, 0) ASC, tx_count DESC
    `;
  }

  /* ════════════════════════════════════════════════════════════════════════
     2. SUBSCRIPTIONS — regular + stable amount + monthly-ish
     ════════════════════════════════════════════════════════════════════════ */

  async subscriptions(
    userId: string,
    minOccurrences: number,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<SubscriptionRow[]> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    return this.prisma.$queryRaw<SubscriptionRow[]>`
      WITH merchant_txns AS (
        SELECT
          COALESCE(t.merchant_name_clean, t.description_raw) AS merchant,
          t.mcc_category AS category,
          ABS(t.amount) AS amt,
          t.transaction_time AS ts
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
      ),
      with_intervals AS (
        SELECT
          merchant,
          category,
          amt,
          ts,
          EXTRACT(EPOCH FROM ts - LAG(ts) OVER (PARTITION BY merchant ORDER BY ts)) / 86400.0 AS interval_days
        FROM merchant_txns
      ),
      merchant_stats AS (
        SELECT
          merchant,
          MAX(category) AS category,
          AVG(amt)::numeric AS avg_amount,
          AVG(interval_days)::numeric AS avg_interval,
          COUNT(*) AS tx_count,
          SUM(amt)::numeric AS total_spent,
          MIN(ts) AS first_seen,
          MAX(ts) AS last_seen,
          -- Coefficient of variation of amount (lower = more stable)
          CASE WHEN AVG(amt) > 0
               THEN (COALESCE(STDDEV(amt), 0) / AVG(amt))::numeric
               ELSE 0 END AS amount_cv,
          COALESCE(STDDEV(interval_days), 0)::numeric AS std_interval
        FROM with_intervals
        WHERE interval_days IS NOT NULL
        GROUP BY merchant
        HAVING COUNT(*) >= ${minOccurrences}
      )
      SELECT
        merchant,
        category,
        avg_amount,
        avg_interval::float AS avg_interval,
        tx_count::int AS tx_count,
        total_spent,
        first_seen,
        last_seen,
        amount_cv::float AS amount_cv
      FROM merchant_stats
      WHERE amount_cv < 0.15                        -- stable amount (< 15% CV)
        AND avg_interval BETWEEN 5 AND 370          -- weekly to yearly
        AND std_interval / NULLIF(avg_interval, 0) < 0.35  -- regular timing
      ORDER BY avg_interval ASC, tx_count DESC
    `;
  }

  /* ════════════════════════════════════════════════════════════════════════
     3. RECURRING EXPENSES
     ════════════════════════════════════════════════════════════════════════ */

  async recurringExpenses(
    userId: string,
    minOccurrences: number,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<RecurringExpenseRow[]> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    return this.prisma.$queryRaw<RecurringExpenseRow[]>`
      WITH merchant_txns AS (
        SELECT
          COALESCE(t.merchant_name_clean, t.description_raw) AS merchant,
          t.mcc_category AS category,
          ABS(t.amount) AS amt,
          t.transaction_time AS ts
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
      ),
      with_intervals AS (
        SELECT
          merchant,
          category,
          amt,
          ts,
          EXTRACT(EPOCH FROM ts - LAG(ts) OVER (PARTITION BY merchant ORDER BY ts)) / 86400.0 AS interval_days
        FROM merchant_txns
      )
      SELECT
        merchant,
        MAX(category) AS category,
        COUNT(*)::int AS occurrences,
        AVG(amt)::numeric AS avg_amount,
        SUM(amt)::numeric AS total_spent,
        COALESCE(AVG(interval_days), 0)::float AS avg_interval,
        COALESCE(STDDEV(interval_days), 0)::float AS std_interval,
        MAX(ts) AS last_date
      FROM with_intervals
      GROUP BY merchant
      HAVING COUNT(*) >= ${minOccurrences}
      ORDER BY COUNT(*) DESC, SUM(amt) DESC
    `;
  }

  /* ════════════════════════════════════════════════════════════════════════
     4. MONTH-PERIOD BEHAVIOR (beginning / middle / end)
     ════════════════════════════════════════════════════════════════════════ */

  async monthPeriodSpending(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<MonthPeriodRow[]> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    return this.prisma.$queryRaw<MonthPeriodRow[]>`
      WITH base AS (
        SELECT
          ABS(t.amount) AS amt,
          EXTRACT(DAY FROM t.transaction_time)::int AS dom,
          DATE_TRUNC('month', t.transaction_time) AS mo
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
      ),
      with_period AS (
        SELECT
          amt,
          mo,
          CASE
            WHEN dom BETWEEN 1  AND 10 THEN 1
            WHEN dom BETWEEN 11 AND 20 THEN 2
            ELSE 3
          END AS period
        FROM base
      )
      SELECT
        period::int,
        SUM(amt)::numeric AS total_spending,
        COUNT(*)::int AS tx_count,
        AVG(amt)::numeric AS avg_tx_amount,
        COUNT(DISTINCT mo)::int AS months_count
      FROM with_period
      GROUP BY period
      ORDER BY period
    `;
  }

  async monthPeriodTopCategories(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<MonthPeriodCategoryRow[]> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    return this.prisma.$queryRaw<MonthPeriodCategoryRow[]>`
      WITH base AS (
        SELECT
          ABS(t.amount) AS amt,
          COALESCE(t.mcc_category, 'Uncategorized') AS category,
          EXTRACT(DAY FROM t.transaction_time)::int AS dom
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
      ),
      ranked AS (
        SELECT
          CASE
            WHEN dom BETWEEN 1  AND 10 THEN 1
            WHEN dom BETWEEN 11 AND 20 THEN 2
            ELSE 3
          END AS period,
          category,
          SUM(amt)::numeric AS total,
          ROW_NUMBER() OVER (
            PARTITION BY CASE
              WHEN dom BETWEEN 1  AND 10 THEN 1
              WHEN dom BETWEEN 11 AND 20 THEN 2
              ELSE 3
            END
            ORDER BY SUM(amt) DESC
          ) AS rn
        FROM base
        GROUP BY period, category
      )
      SELECT period::int, category, total
      FROM ranked
      WHERE rn <= 3
      ORDER BY period, total DESC
    `;
  }

  /* ════════════════════════════════════════════════════════════════════════
     5. FINANCIAL HABITS — multiple sub-queries
     ════════════════════════════════════════════════════════════════════════ */

  async weekdayWeekendSpending(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<WeekdayWeekendRow[]> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    return this.prisma.$queryRaw<WeekdayWeekendRow[]>`
      WITH daily AS (
        SELECT
          DATE_TRUNC('day', t.transaction_time)::date AS d,
          EXTRACT(DOW FROM t.transaction_time) IN (0, 6) AS is_weekend,
          SUM(ABS(t.amount))::numeric AS daily_total
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
        GROUP BY DATE_TRUNC('day', t.transaction_time)::date,
                 EXTRACT(DOW FROM t.transaction_time) IN (0, 6)
      )
      SELECT
        is_weekend,
        SUM(daily_total)::numeric AS total_spending,
        COUNT(*)::int AS day_count
      FROM daily
      GROUP BY is_weekend
    `;
  }

  async timeOfDaySpending(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<TimeOfDayRow[]> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    return this.prisma.$queryRaw<TimeOfDayRow[]>`
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM t.transaction_time) BETWEEN 6  AND 11 THEN 0
          WHEN EXTRACT(HOUR FROM t.transaction_time) BETWEEN 12 AND 17 THEN 1
          WHEN EXTRACT(HOUR FROM t.transaction_time) BETWEEN 18 AND 22 THEN 2
          ELSE 3
        END AS slot,
        SUM(ABS(t.amount))::numeric AS total_spending,
        COUNT(*)::int AS tx_count,
        AVG(ABS(t.amount))::numeric AS avg_amount
      FROM transactions t
      WHERE t.user_id = ${userId}::uuid
        AND t.transaction_type = 'DEBIT'
        ${fromF} ${toF} ${acctF}
      GROUP BY slot
      ORDER BY slot
    `;
  }

  async monthlyIncomeExpense(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<MonthlyAggRow> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    const [row] = await this.prisma.$queryRaw<MonthlyAggRow[]>`
      WITH monthly AS (
        SELECT
          DATE_TRUNC('month', t.transaction_time) AS mo,
          COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'CREDIT'), 0)::numeric AS income,
          COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.transaction_type = 'DEBIT'), 0)::numeric AS expense
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type IN ('DEBIT', 'CREDIT')
          ${fromF} ${toF} ${acctF}
        GROUP BY DATE_TRUNC('month', t.transaction_time)
      )
      SELECT
        AVG(income)::numeric AS avg_income,
        AVG(expense)::numeric AS avg_expense,
        COUNT(*)::int AS months_count
      FROM monthly
    `;

    return row ?? { avg_income: '0', avg_expense: '0', months_count: 0 };
  }

  async largeTransactions(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<LargeTransactionRow> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    const [row] = await this.prisma.$queryRaw<LargeTransactionRow[]>`
      WITH stats AS (
        SELECT
          AVG(ABS(t.amount))::numeric AS avg_amt,
          STDDEV(ABS(t.amount))::numeric AS std_amt,
          COUNT(*)::int AS total_count
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
      ),
      threshold AS (
        SELECT (avg_amt + 2 * COALESCE(std_amt, 0))::numeric AS thr, total_count
        FROM stats
      )
      SELECT
        thr::numeric AS threshold,
        (SELECT COUNT(*)::int
         FROM transactions t
         WHERE t.user_id = ${userId}::uuid
           AND t.transaction_type = 'DEBIT'
           AND ABS(t.amount) > thr
           ${fromF} ${toF} ${acctF}
        ) AS large_count,
        total_count
      FROM threshold
    `;

    return row ?? { threshold: '0', large_count: 0, total_count: 0 };
  }

  async stableCategories(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<StableCategoryRow[]> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    return this.prisma.$queryRaw<StableCategoryRow[]>`
      WITH monthly_cat AS (
        SELECT
          COALESCE(t.mcc_category, 'Uncategorized') AS category,
          DATE_TRUNC('month', t.transaction_time) AS mo,
          SUM(ABS(t.amount))::numeric AS spend
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
        GROUP BY t.mcc_category, DATE_TRUNC('month', t.transaction_time)
      )
      SELECT
        category,
        COUNT(DISTINCT mo)::int AS months_present,
        AVG(spend)::numeric AS avg_monthly_spend
      FROM monthly_cat
      GROUP BY category
      HAVING COUNT(DISTINCT mo) >= 2
      ORDER BY COUNT(DISTINCT mo) DESC, AVG(spend) DESC
      LIMIT 10
    `;
  }

  async dailyActivity(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<{ mostActive: string; leastActive: string; avgPerDay: string }> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const rows = await this.prisma.$queryRaw<
      { dow: number; avg_count: string }[]
    >`
      WITH daily AS (
        SELECT
          DATE_TRUNC('day', t.transaction_time)::date AS d,
          COUNT(*) AS cnt
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
        GROUP BY DATE_TRUNC('day', t.transaction_time)::date
      )
      SELECT
        EXTRACT(DOW FROM d)::int AS dow,
        AVG(cnt)::numeric AS avg_count
      FROM daily
      GROUP BY EXTRACT(DOW FROM d)
      ORDER BY avg_count DESC
    `;

    const [totalRow] = await this.prisma.$queryRaw<{ avg_per_day: string }[]>`
      WITH daily AS (
        SELECT
          DATE_TRUNC('day', t.transaction_time)::date AS d,
          COUNT(*) AS cnt
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
        GROUP BY DATE_TRUNC('day', t.transaction_time)::date
      )
      SELECT AVG(cnt)::numeric AS avg_per_day FROM daily
    `;

    const mostActive = rows.length > 0 ? dayNames[rows[0].dow] : 'N/A';
    const leastActive = rows.length > 0 ? dayNames[rows[rows.length - 1].dow] : 'N/A';

    return {
      mostActive,
      leastActive,
      avgPerDay: totalRow?.avg_per_day ?? '0',
    };
  }
}
