import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DailySeriesPoint } from '../domain/forecast.interfaces';

export interface CategoryHistoryRow {
  category: string;
  month: Date;
  total: string;
}

export interface CurrentBalanceRow {
  balance: string;
}

@Injectable()
export class ForecastingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /* ────────────────────────────────────────────────────────────────────────
     Daily income / expense series — gap-filled via generate_series.
     Missing days get 0 so that moving averages aren't skewed.
     ──────────────────────────────────────────────────────────────────────── */

  async dailySeries(
    userId: string,
    from: Date,
    to: Date,
    accountId?: string,
  ): Promise<DailySeriesPoint[]> {
    const acctF = accountId
      ? Prisma.sql`AND t.account_id = ${accountId}::uuid`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<
      { date: Date; expense: string; income: string }[]
    >`
      WITH date_range AS (
        SELECT generate_series(
          DATE_TRUNC('day', ${from}::timestamp),
          DATE_TRUNC('day', ${to}::timestamp),
          '1 day'
        )::date AS d
      ),
      daily AS (
        SELECT
          DATE_TRUNC('day', t.transaction_time)::date AS d,
          COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.transaction_type = 'DEBIT'),  0)::numeric AS expense,
          COALESCE(SUM(t.amount)      FILTER (WHERE t.transaction_type = 'CREDIT'), 0)::numeric AS income
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.transaction_type IN ('DEBIT', 'CREDIT')
          AND t.transaction_time >= ${from}
          AND t.transaction_time <= ${to}
          ${acctF}
        GROUP BY DATE_TRUNC('day', t.transaction_time)::date
      )
      SELECT
        dr.d AS date,
        COALESCE(daily.expense, 0)::numeric AS expense,
        COALESCE(daily.income,  0)::numeric AS income
      FROM date_range dr
      LEFT JOIN daily ON daily.d = dr.d
      ORDER BY dr.d ASC
    `;

    return rows.map((r) => ({
      date: r.date instanceof Date ? r.date : new Date(r.date),
      expense: Number(r.expense),
      income: Number(r.income),
    }));
  }

  /* ────────────────────────────────────────────────────────────────────────
     Monthly category history (for per-category forecasts)
     ──────────────────────────────────────────────────────────────────────── */

  async categoryMonthlyHistory(
    userId: string,
    from: Date,
    to: Date,
    accountId?: string,
  ): Promise<CategoryHistoryRow[]> {
    const acctF = accountId
      ? Prisma.sql`AND t.account_id = ${accountId}::uuid`
      : Prisma.sql``;

    return this.prisma.$queryRaw<CategoryHistoryRow[]>`
      SELECT
        COALESCE(t.mcc_category, 'Uncategorized') AS category,
        DATE_TRUNC('month', t.transaction_time) AS month,
        SUM(ABS(t.amount))::numeric AS total
      FROM transactions t
      WHERE t.user_id = ${userId}::uuid
        AND t.transaction_type = 'DEBIT'
        AND t.transaction_time >= ${from}
        AND t.transaction_time <= ${to}
        ${acctF}
      GROUP BY t.mcc_category, DATE_TRUNC('month', t.transaction_time)
      ORDER BY category, month
    `;
  }

  /* ────────────────────────────────────────────────────────────────────────
     Current balance — sum of linked accounts (or specific one)
     ──────────────────────────────────────────────────────────────────────── */

  async currentBalance(userId: string, accountId?: string): Promise<number> {
    const acctF = accountId
      ? Prisma.sql`AND id = ${accountId}::uuid`
      : Prisma.sql``;

    const [row] = await this.prisma.$queryRaw<CurrentBalanceRow[]>`
      SELECT COALESCE(SUM(balance), 0)::numeric AS balance
      FROM accounts
      WHERE user_id = ${userId}::uuid
        AND is_active = true
        ${acctF}
    `;

    return Number(row?.balance ?? 0);
  }
}
