import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AnomalyRow,
  CategorySpikeRow,
  UnusualPurchaseRow,
} from '../domain/insight.interfaces';

/* ───────────────────────────────────────────────────────────────────────────
   Helper rows used only by conclusions
   ─────────────────────────────────────────────────────────────────────────── */

export interface PeriodSummaryRow {
  total_expense: string;
  total_income: string;
  tx_count: number;
  avg_tx: string;
  top_category: string | null;
  top_category_total: string | null;
  unique_merchants: number;
}

export interface PrevPeriodSummaryRow {
  total_expense: string;
  total_income: string;
}

export interface TopGrowthCategoryRow {
  category: string;
  current_total: string;
  previous_total: string;
  growth_pct: number;
}

export interface BiggestSingleRow {
  merchant: string;
  amount: string;
  transaction_time: Date;
  category: string | null;
}

@Injectable()
export class InsightsRepository {
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
     1. ANOMALOUS TRANSACTIONS
     Z-score per merchant: |amount - μ| / σ  >  threshold
     Falls back to global stats if merchant has < 5 transactions
     ════════════════════════════════════════════════════════════════════════ */

  async anomalousTransactions(
    userId: string,
    zThreshold: number,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<AnomalyRow[]> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    return this.prisma.$queryRaw<AnomalyRow[]>`
      WITH merchant_stats AS (
        SELECT
          COALESCE(t.merchant_name_clean, t.description_raw) AS merchant,
          AVG(ABS(t.amount))::numeric  AS avg_amount,
          STDDEV(ABS(t.amount))::numeric AS std_amount,
          COUNT(*) AS cnt
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${acctF}
        GROUP BY COALESCE(t.merchant_name_clean, t.description_raw)
      ),
      global_stats AS (
        SELECT
          AVG(ABS(t.amount))::numeric  AS avg_amount,
          STDDEV(ABS(t.amount))::numeric AS std_amount
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${acctF}
      ),
      scored AS (
        SELECT
          t.id,
          COALESCE(t.merchant_name_clean, t.description_raw) AS merchant,
          t.mcc_category AS category,
          ABS(t.amount)::numeric AS amount,
          t.transaction_time,
          COALESCE(ms.avg_amount, gs.avg_amount) AS avg_amount,
          COALESCE(ms.std_amount, gs.std_amount) AS std_amount,
          CASE
            WHEN COALESCE(ms.std_amount, gs.std_amount) > 0
            THEN (ABS(t.amount) - COALESCE(ms.avg_amount, gs.avg_amount))
                 / COALESCE(ms.std_amount, gs.std_amount)
            ELSE 0
          END::float AS z_score
        FROM transactions t
        CROSS JOIN global_stats gs
        LEFT JOIN merchant_stats ms
          ON ms.merchant = COALESCE(t.merchant_name_clean, t.description_raw)
          AND ms.cnt >= 5
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${fromF} ${toF} ${acctF}
      )
      SELECT id, merchant, category, amount, transaction_time,
             avg_amount, std_amount, z_score
      FROM scored
      WHERE z_score > ${zThreshold}
      ORDER BY z_score DESC
      LIMIT 50
    `;
  }

  /* ════════════════════════════════════════════════════════════════════════
     2. CATEGORY SPIKES
     Compare current period vs equal-length previous period
     ════════════════════════════════════════════════════════════════════════ */

  async categorySpikes(
    userId: string,
    spikeThresholdPct: number,
    from: Date,
    to: Date,
    accountId?: string,
  ): Promise<CategorySpikeRow[]> {
    const periodMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - periodMs);
    const prevTo = new Date(from.getTime());
    const acctF = accountId
      ? Prisma.sql`AND t.account_id = ${accountId}::uuid`
      : Prisma.sql``;

    return this.prisma.$queryRaw<CategorySpikeRow[]>`
      WITH current_period AS (
        SELECT
          COALESCE(t.mcc_category, 'Uncategorized') AS category,
          SUM(ABS(t.amount))::numeric AS total,
          COUNT(*)::int AS cnt
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          AND t.transaction_time >= ${from}
          AND t.transaction_time <= ${to}
          ${acctF}
        GROUP BY t.mcc_category
      ),
      previous_period AS (
        SELECT
          COALESCE(t.mcc_category, 'Uncategorized') AS category,
          SUM(ABS(t.amount))::numeric AS total,
          COUNT(*)::int AS cnt
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          AND t.transaction_time >= ${prevFrom}
          AND t.transaction_time < ${prevTo}
          ${acctF}
        GROUP BY t.mcc_category
      )
      SELECT
        c.category,
        c.total AS current_total,
        COALESCE(p.total, 0)::numeric AS previous_total,
        CASE
          WHEN COALESCE(p.total, 0) > 0
          THEN ((c.total - p.total) / p.total * 100)::float
          ELSE 100
        END AS change_pct,
        c.cnt AS current_count,
        COALESCE(p.cnt, 0)::int AS previous_count
      FROM current_period c
      LEFT JOIN previous_period p ON p.category = c.category
      WHERE c.total > 0
        AND (
          COALESCE(p.total, 0) = 0
          OR ((c.total - p.total) / p.total * 100) >= ${spikeThresholdPct}
        )
      ORDER BY change_pct DESC
      LIMIT 20
    `;
  }

  /* ════════════════════════════════════════════════════════════════════════
     3. UNUSUAL PURCHASES (rare categories for this user)
     Categories where lifetime count ≤ 3 — any new tx is "unusual"
     ════════════════════════════════════════════════════════════════════════ */

  async unusualPurchases(
    userId: string,
    from?: Date,
    to?: Date,
    accountId?: string,
  ): Promise<UnusualPurchaseRow[]> {
    const { fromF, toF, acctF } = this.filters(from, to, accountId);

    return this.prisma.$queryRaw<UnusualPurchaseRow[]>`
      WITH category_history AS (
        SELECT
          COALESCE(t.mcc_category, 'Uncategorized') AS category,
          COUNT(*) AS lifetime_count,
          SUM(ABS(t.amount))::numeric AS lifetime_total
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type = 'DEBIT'
          ${acctF}
        GROUP BY t.mcc_category
      ),
      rare_categories AS (
        SELECT category, lifetime_count, lifetime_total
        FROM category_history
        WHERE lifetime_count <= 3
      )
      SELECT
        t.id,
        COALESCE(t.merchant_name_clean, t.description_raw) AS merchant,
        COALESCE(t.mcc_category, 'Uncategorized') AS category,
        ABS(t.amount)::numeric AS amount,
        t.transaction_time,
        rc.lifetime_count::int AS category_lifetime_count,
        rc.lifetime_total AS category_lifetime_total
      FROM transactions t
      INNER JOIN rare_categories rc
        ON COALESCE(t.mcc_category, 'Uncategorized') = rc.category
      WHERE t.user_id = ${userId}::uuid
        AND t.transaction_type = 'DEBIT'
        ${fromF} ${toF} ${acctF}
      ORDER BY t.transaction_time DESC
      LIMIT 30
    `;
  }

  /* ════════════════════════════════════════════════════════════════════════
     4. DATA FOR CONCLUSIONS
     ════════════════════════════════════════════════════════════════════════ */

  async periodSummary(
    userId: string,
    from: Date,
    to: Date,
    accountId?: string,
  ): Promise<PeriodSummaryRow> {
    const acctF = accountId
      ? Prisma.sql`AND t.account_id = ${accountId}::uuid`
      : Prisma.sql``;

    const [row] = await this.prisma.$queryRaw<PeriodSummaryRow[]>`
      SELECT
        COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.transaction_type = 'DEBIT'), 0)::numeric  AS total_expense,
        COALESCE(SUM(t.amount)      FILTER (WHERE t.transaction_type = 'CREDIT'), 0)::numeric AS total_income,
        COUNT(*) FILTER (WHERE t.transaction_type = 'DEBIT')::int AS tx_count,
        COALESCE(AVG(ABS(t.amount)) FILTER (WHERE t.transaction_type = 'DEBIT'), 0)::numeric AS avg_tx,
        (
          SELECT mcc_category FROM transactions t2
          WHERE t2.user_id = ${userId}::uuid
            AND t2.transaction_type = 'DEBIT'
            AND t2.transaction_time >= ${from} AND t2.transaction_time <= ${to}
            ${acctF}
          GROUP BY mcc_category
          ORDER BY SUM(ABS(amount)) DESC
          LIMIT 1
        ) AS top_category,
        (
          SELECT SUM(ABS(amount))::numeric FROM transactions t2
          WHERE t2.user_id = ${userId}::uuid
            AND t2.transaction_type = 'DEBIT'
            AND t2.transaction_time >= ${from} AND t2.transaction_time <= ${to}
            ${acctF}
          GROUP BY mcc_category
          ORDER BY SUM(ABS(amount)) DESC
          LIMIT 1
        ) AS top_category_total,
        COUNT(DISTINCT COALESCE(t.merchant_name_clean, t.description_raw))::int AS unique_merchants
      FROM transactions t
      WHERE t.user_id = ${userId}::uuid
        AND t.transaction_time >= ${from} AND t.transaction_time <= ${to}
        ${acctF}
    `;

    return (
      row ?? {
        total_expense: '0',
        total_income: '0',
        tx_count: 0,
        avg_tx: '0',
        top_category: null,
        top_category_total: null,
        unique_merchants: 0,
      }
    );
  }

  async previousPeriodSummary(
    userId: string,
    from: Date,
    to: Date,
    accountId?: string,
  ): Promise<PrevPeriodSummaryRow> {
    const periodMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - periodMs);
    const prevTo = new Date(from.getTime());
    const acctF = accountId
      ? Prisma.sql`AND t.account_id = ${accountId}::uuid`
      : Prisma.sql``;

    const [row] = await this.prisma.$queryRaw<PrevPeriodSummaryRow[]>`
      SELECT
        COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.transaction_type = 'DEBIT'), 0)::numeric  AS total_expense,
        COALESCE(SUM(t.amount)      FILTER (WHERE t.transaction_type = 'CREDIT'), 0)::numeric AS total_income
      FROM transactions t
      WHERE t.user_id = ${userId}::uuid
        AND t.transaction_time >= ${prevFrom} AND t.transaction_time < ${prevTo}
        ${acctF}
    `;

    return row ?? { total_expense: '0', total_income: '0' };
  }

  async topGrowthCategory(
    userId: string,
    from: Date,
    to: Date,
    accountId?: string,
  ): Promise<TopGrowthCategoryRow | null> {
    const periodMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - periodMs);
    const prevTo = new Date(from.getTime());
    const acctF = accountId
      ? Prisma.sql`AND t.account_id = ${accountId}::uuid`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<TopGrowthCategoryRow[]>`
      WITH cur AS (
        SELECT COALESCE(t.mcc_category, 'Uncategorized') AS category,
               SUM(ABS(t.amount))::numeric AS total
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid AND t.transaction_type = 'DEBIT'
          AND t.transaction_time >= ${from} AND t.transaction_time <= ${to}
          ${acctF}
        GROUP BY t.mcc_category
      ),
      prev AS (
        SELECT COALESCE(t.mcc_category, 'Uncategorized') AS category,
               SUM(ABS(t.amount))::numeric AS total
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid AND t.transaction_type = 'DEBIT'
          AND t.transaction_time >= ${prevFrom} AND t.transaction_time < ${prevTo}
          ${acctF}
        GROUP BY t.mcc_category
      )
      SELECT
        c.category,
        c.total AS current_total,
        COALESCE(p.total, 0)::numeric AS previous_total,
        CASE WHEN COALESCE(p.total, 0) > 0
             THEN ((c.total - p.total) / p.total * 100)::float
             ELSE 100 END AS growth_pct
      FROM cur c
      LEFT JOIN prev p ON p.category = c.category
      WHERE c.total > 0
      ORDER BY growth_pct DESC
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  async biggestSingleExpense(
    userId: string,
    from: Date,
    to: Date,
    accountId?: string,
  ): Promise<BiggestSingleRow | null> {
    const acctF = accountId
      ? Prisma.sql`AND t.account_id = ${accountId}::uuid`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<BiggestSingleRow[]>`
      SELECT
        COALESCE(t.merchant_name_clean, t.description_raw) AS merchant,
        ABS(t.amount)::numeric AS amount,
        t.transaction_time,
        t.mcc_category AS category
      FROM transactions t
      WHERE t.user_id = ${userId}::uuid
        AND t.transaction_type = 'DEBIT'
        AND t.transaction_time >= ${from} AND t.transaction_time <= ${to}
        ${acctF}
      ORDER BY ABS(t.amount) DESC
      LIMIT 1
    `;

    return rows[0] ?? null;
  }
}
