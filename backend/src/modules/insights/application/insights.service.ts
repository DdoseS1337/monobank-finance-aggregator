import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RedisService } from '../../../redis/redis.service';
import { InsightsRepository } from '../infrastructure/insights.repository';
import { InsightsQueryDto } from '../presentation/dto/insights-query.dto';
import {
  Insight,
  InsightsResponse,
  InsightSeverity,
} from '../domain/insight.interfaces';

const TTL = {
  anomalies: 900,
  spikes: 1200,
  unusual: 1200,
  conclusions: 1800,
  all: 900,
};

@Injectable()
export class InsightsService {
  constructor(
    private readonly repo: InsightsRepository,
    private readonly redis: RedisService,
  ) {}

  /* ── Cache helpers ─────────────────────────────────────────────────────── */

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
    return `insights:${endpoint}:${userId}:${stable}`;
  }

  /* ── Default period: current month ─────────────────────────────────────── */

  private resolvePeriod(from?: string, to?: string): { from: Date; to: Date } {
    const now = new Date();
    return {
      from: from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1),
      to: to ? new Date(to) : now,
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     1. ANOMALOUS TRANSACTIONS
     ════════════════════════════════════════════════════════════════════════ */

  async anomalies(userId: string, query: InsightsQueryDto): Promise<Insight[]> {
    const { accountId, zScoreThreshold = 2.5 } = query;
    const { from, to } = this.resolvePeriod(query.from, query.to);
    const cacheKey = this.key('anomalies', userId, {
      from: from.toISOString(), to: to.toISOString(), accountId, zScoreThreshold,
    });

    return this.cached(cacheKey, TTL.anomalies, async () => {
      const rows = await this.repo.anomalousTransactions(
        userId, zScoreThreshold, from, to, accountId,
      );

      return rows.map((r): Insight => {
        const zScore = Number(r.z_score);
        const severity: InsightSeverity =
          zScore > 4 ? 'critical' : zScore > 3 ? 'warning' : 'info';

        const amount = new Prisma.Decimal(r.amount);
        const avg = new Prisma.Decimal(r.avg_amount);
        const ratio = avg.isZero() ? 0 : amount.div(avg).toNumber();

        return {
          type: 'anomaly',
          severity,
          title: `Аномальна витрата: ${r.merchant}`,
          description:
            `${amount.toFixed(2)} ₴ — це у ${ratio.toFixed(1)}x більше за звичайну суму ` +
            `(середня ${avg.toFixed(2)} ₴). Z-score: ${zScore.toFixed(1)}.`,
          date: new Date(r.transaction_time).toISOString().slice(0, 10),
          meta: {
            transactionId: r.id,
            merchant: r.merchant,
            category: r.category,
            amount: amount.toFixed(2),
            avgAmount: avg.toFixed(2),
            zScore: Math.round(zScore * 10) / 10,
            ratio: Math.round(ratio * 10) / 10,
          },
        };
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     2. CATEGORY SPIKES
     ════════════════════════════════════════════════════════════════════════ */

  async categorySpikes(userId: string, query: InsightsQueryDto): Promise<Insight[]> {
    const { accountId, spikeThresholdPct = 50 } = query;
    const { from, to } = this.resolvePeriod(query.from, query.to);
    const cacheKey = this.key('spikes', userId, {
      from: from.toISOString(), to: to.toISOString(), accountId, spikeThresholdPct,
    });

    return this.cached(cacheKey, TTL.spikes, async () => {
      const rows = await this.repo.categorySpikes(
        userId, spikeThresholdPct, from, to, accountId,
      );

      return rows.map((r): Insight => {
        const changePct = Number(r.change_pct);
        const severity: InsightSeverity =
          changePct > 200 ? 'critical' : changePct > 100 ? 'warning' : 'info';

        const current = new Prisma.Decimal(r.current_total);
        const previous = new Prisma.Decimal(r.previous_total);

        return {
          type: 'category_spike',
          severity,
          title: `Різке зростання: ${r.category}`,
          description: previous.isZero()
            ? `Нова категорія витрат "${r.category}" — ${current.toFixed(2)} ₴ ` +
              `(${r.current_count} транзакцій) за цей період.`
            : `Витрати на "${r.category}" зросли на ${changePct.toFixed(0)}% — ` +
              `з ${previous.toFixed(2)} ₴ до ${current.toFixed(2)} ₴.`,
          date: to.toISOString().slice(0, 10),
          meta: {
            category: r.category,
            currentTotal: current.toFixed(2),
            previousTotal: previous.toFixed(2),
            changePct: Math.round(changePct),
            currentCount: r.current_count,
            previousCount: r.previous_count,
          },
        };
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     3. UNUSUAL PURCHASES
     ════════════════════════════════════════════════════════════════════════ */

  async unusualPurchases(userId: string, query: InsightsQueryDto): Promise<Insight[]> {
    const { accountId } = query;
    const { from, to } = this.resolvePeriod(query.from, query.to);
    const cacheKey = this.key('unusual', userId, {
      from: from.toISOString(), to: to.toISOString(), accountId,
    });

    return this.cached(cacheKey, TTL.unusual, async () => {
      const rows = await this.repo.unusualPurchases(userId, from, to, accountId);

      return rows.map((r): Insight => {
        const amount = new Prisma.Decimal(r.amount);
        return {
          type: 'unusual_purchase',
          severity: 'info',
          title: `Нетипова покупка: ${r.merchant}`,
          description:
            `${amount.toFixed(2)} ₴ у категорії "${r.category}", ` +
            `яка зустрічалась лише ${r.category_lifetime_count} раз(и) у вашій історії.`,
          date: new Date(r.transaction_time).toISOString().slice(0, 10),
          meta: {
            transactionId: r.id,
            merchant: r.merchant,
            category: r.category,
            amount: amount.toFixed(2),
            categoryLifetimeCount: r.category_lifetime_count,
            categoryLifetimeTotal: new Prisma.Decimal(r.category_lifetime_total).toFixed(2),
          },
        };
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     4. FINANCIAL CONCLUSIONS — auto-generated text summaries
     ════════════════════════════════════════════════════════════════════════ */

  async conclusions(userId: string, query: InsightsQueryDto): Promise<Insight[]> {
    const { accountId } = query;
    const { from, to } = this.resolvePeriod(query.from, query.to);
    const cacheKey = this.key('conclusions', userId, {
      from: from.toISOString(), to: to.toISOString(), accountId,
    });

    return this.cached(cacheKey, TTL.conclusions, async () => {
      const [summary, prevSummary, topGrowth, biggest] = await Promise.all([
        this.repo.periodSummary(userId, from, to, accountId),
        this.repo.previousPeriodSummary(userId, from, to, accountId),
        this.repo.topGrowthCategory(userId, from, to, accountId),
        this.repo.biggestSingleExpense(userId, from, to, accountId),
      ]);

      const insights: Insight[] = [];
      const periodLabel = `${from.toISOString().slice(0, 10)} — ${to.toISOString().slice(0, 10)}`;

      const expense = new Prisma.Decimal(summary.total_expense);
      const income = new Prisma.Decimal(summary.total_income);
      const prevExpense = new Prisma.Decimal(prevSummary.total_expense);
      const prevIncome = new Prisma.Decimal(prevSummary.total_income);

      // ── 1. Overall spending conclusion ──────────────────────────────────
      if (summary.tx_count > 0) {
        const expenseChange = prevExpense.isZero()
          ? null
          : expense.sub(prevExpense).div(prevExpense).mul(100);

        let spendText = `За період ${periodLabel} витрачено ${expense.toFixed(2)} ₴ ` +
          `(${summary.tx_count} транзакцій, середня ${new Prisma.Decimal(summary.avg_tx).toFixed(2)} ₴).`;

        if (expenseChange !== null) {
          const dir = expenseChange.isPositive() ? 'більше' : 'менше';
          spendText += ` Це на ${expenseChange.abs().toFixed(1)}% ${dir} за попередній аналогічний період.`;
        }

        insights.push({
          type: 'conclusion',
          severity: expenseChange && expenseChange.greaterThan(30) ? 'warning' : 'info',
          title: 'Загальні витрати',
          description: spendText,
          date: to.toISOString().slice(0, 10),
          meta: {
            totalExpense: expense.toFixed(2),
            totalIncome: income.toFixed(2),
            txCount: summary.tx_count,
            expenseChangePct: expenseChange?.toFixed(1) ?? null,
          },
        });
      }

      // ── 2. Savings conclusion ───────────────────────────────────────────
      if (income.greaterThan(0)) {
        const savings = income.sub(expense);
        const savingsRate = savings.div(income).mul(100);
        const severity: InsightSeverity =
          savingsRate.lessThan(0) ? 'critical' : savingsRate.lessThan(10) ? 'warning' : 'info';

        insights.push({
          type: 'conclusion',
          severity,
          title: 'Баланс доходів і витрат',
          description: savings.isNegative()
            ? `Витрати перевищили доходи на ${savings.abs().toFixed(2)} ₴. ` +
              `Дохід: ${income.toFixed(2)} ₴, витрати: ${expense.toFixed(2)} ₴.`
            : `Вдалося зберегти ${savings.toFixed(2)} ₴ (${savingsRate.toFixed(1)}% від доходу). ` +
              `Дохід: ${income.toFixed(2)} ₴, витрати: ${expense.toFixed(2)} ₴.`,
          date: to.toISOString().slice(0, 10),
          meta: {
            income: income.toFixed(2),
            expense: expense.toFixed(2),
            savings: savings.toFixed(2),
            savingsRate: savingsRate.toFixed(1),
          },
        });
      }

      // ── 3. Top category conclusion ──────────────────────────────────────
      if (summary.top_category && summary.top_category_total) {
        const topTotal = new Prisma.Decimal(summary.top_category_total);
        const pct = expense.isZero()
          ? new Prisma.Decimal(0)
          : topTotal.div(expense).mul(100);

        insights.push({
          type: 'conclusion',
          severity: pct.greaterThan(50) ? 'warning' : 'info',
          title: 'Головна категорія витрат',
          description:
            `Найбільше витрачено на "${summary.top_category}" — ` +
            `${topTotal.toFixed(2)} ₴ (${pct.toFixed(1)}% від усіх витрат).`,
          date: to.toISOString().slice(0, 10),
          meta: {
            category: summary.top_category,
            total: topTotal.toFixed(2),
            percent: pct.toFixed(1),
          },
        });
      }

      // ── 4. Fastest growing category ─────────────────────────────────────
      if (topGrowth && Number(topGrowth.growth_pct) > 30) {
        const growthPct = Number(topGrowth.growth_pct);
        const severity: InsightSeverity =
          growthPct > 200 ? 'critical' : growthPct > 100 ? 'warning' : 'info';

        insights.push({
          type: 'conclusion',
          severity,
          title: 'Найшвидше зростання витрат',
          description:
            `Категорія "${topGrowth.category}" зросла на ${growthPct.toFixed(0)}% — ` +
            `з ${new Prisma.Decimal(topGrowth.previous_total).toFixed(2)} ₴ ` +
            `до ${new Prisma.Decimal(topGrowth.current_total).toFixed(2)} ₴.`,
          date: to.toISOString().slice(0, 10),
          meta: {
            category: topGrowth.category,
            currentTotal: topGrowth.current_total,
            previousTotal: topGrowth.previous_total,
            growthPct: Math.round(growthPct),
          },
        });
      }

      // ── 5. Biggest single expense ───────────────────────────────────────
      if (biggest) {
        const bigAmt = new Prisma.Decimal(biggest.amount);
        insights.push({
          type: 'conclusion',
          severity: 'info',
          title: 'Найбільша разова витрата',
          description:
            `${bigAmt.toFixed(2)} ₴ — ${biggest.merchant}` +
            (biggest.category ? ` (${biggest.category})` : '') +
            ` ${new Date(biggest.transaction_time).toISOString().slice(0, 10)}.`,
          date: new Date(biggest.transaction_time).toISOString().slice(0, 10),
          meta: {
            merchant: biggest.merchant,
            amount: bigAmt.toFixed(2),
            category: biggest.category,
          },
        });
      }

      // ── 6. Merchant diversity ───────────────────────────────────────────
      if (summary.unique_merchants > 0) {
        insights.push({
          type: 'conclusion',
          severity: 'info',
          title: 'Різноманітність витрат',
          description:
            `Ви здійснили покупки у ${summary.unique_merchants} різних місцях ` +
            `за цей період.`,
          date: to.toISOString().slice(0, 10),
          meta: { uniqueMerchants: summary.unique_merchants },
        });
      }

      return insights;
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     ALL — combined feed sorted by severity + date
     ════════════════════════════════════════════════════════════════════════ */

  async all(userId: string, query: InsightsQueryDto): Promise<InsightsResponse> {
    const { from, to } = this.resolvePeriod(query.from, query.to);
    const cacheKey = this.key('all', userId, {
      from: from.toISOString(),
      to: to.toISOString(),
      accountId: query.accountId,
      zScoreThreshold: query.zScoreThreshold,
      spikeThresholdPct: query.spikeThresholdPct,
    });

    return this.cached(cacheKey, TTL.all, async () => {
      const [anomalies, spikes, unusual, conclusions] = await Promise.all([
        this.anomalies(userId, query),
        this.categorySpikes(userId, query),
        this.unusualPurchases(userId, query),
        this.conclusions(userId, query),
      ]);

      const severityOrder: Record<InsightSeverity, number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };

      const insights = [...anomalies, ...spikes, ...unusual, ...conclusions].sort(
        (a, b) =>
          severityOrder[a.severity] - severityOrder[b.severity] ||
          b.date.localeCompare(a.date),
      );

      return {
        insights,
        generatedAt: new Date().toISOString(),
        period: {
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
        },
      };
    });
  }
}
