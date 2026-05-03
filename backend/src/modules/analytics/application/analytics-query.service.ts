import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { AnalyticsRepository } from '../infrastructure/analytics.repository';
import {
  AnalyticsQueryDto,
  IncomeVsExpenseQueryDto,
  PeriodComparisonQueryDto,
} from '../presentation/dto/analytics-query.dto';

const TTL = {
  summary: 300,
  spendingByCategory: 600,
  topCategories: 600,
  topMerchants: 600,
  spendingTrend: 900,
  averageTransaction: 900,
  incomeSummary: 900,
  monthlyTrend: 1800,
  incomeVsExpense: 1800,
  periodComparison: 1800,
  dayOfWeek: 3600,
};

@Injectable()
export class AnalyticsQueryService {
  constructor(
    private readonly repo: AnalyticsRepository,
    private readonly redis: RedisService,
  ) {}

  // ── Cache helper ────────────────────────────────────────────────────────

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
    return `analytics:${endpoint}:${userId}:${stable}`;
  }

  // ── 1. Spending by category ─────────────────────────────────────────────

  async spendingByCategory(userId: string, query: AnalyticsQueryDto) {
    const { from, to, accountId } = query;
    const cacheKey = this.key('spending-by-category', userId, { from, to, accountId });
    return this.cached(cacheKey, TTL.spendingByCategory, () =>
      this.repo.spendingByCategory(
        userId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      ),
    );
  }

  // ── 2. Monthly trend ────────────────────────────────────────────────────

  async monthlyTrend(userId: string, query: AnalyticsQueryDto) {
    const { from, to, accountId } = query;
    const cacheKey = this.key('monthly-trend', userId, { from, to, accountId });
    return this.cached(cacheKey, TTL.monthlyTrend, () =>
      this.repo.monthlyTrend(
        userId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      ),
    );
  }

  // ── 3. Income vs expense ────────────────────────────────────────────────

  async incomeVsExpense(userId: string, query: IncomeVsExpenseQueryDto) {
    const { from, to, accountId, granularity = 'month' } = query;
    const cacheKey = this.key('income-vs-expense', userId, { from, to, accountId, granularity });
    return this.cached(cacheKey, TTL.incomeVsExpense, () =>
      this.repo.incomeVsExpense(
        userId,
        granularity,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      ),
    );
  }

  // ── 4. Top categories ───────────────────────────────────────────────────

  async topCategories(userId: string, query: AnalyticsQueryDto) {
    const { from, to, accountId, limit = 10 } = query;
    const cacheKey = this.key('top-categories', userId, { from, to, accountId, limit });
    return this.cached(cacheKey, TTL.topCategories, () =>
      this.repo.topCategories(
        userId,
        limit,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      ),
    );
  }

  // ── 5. Period comparison ────────────────────────────────────────────────

  async periodComparison(userId: string, query: PeriodComparisonQueryDto) {
    const { period1From, period1To, period2From, period2To, accountId } = query;
    const cacheKey = this.key('period-comparison', userId, {
      period1From, period1To, period2From, period2To, accountId,
    });
    return this.cached(cacheKey, TTL.periodComparison, () =>
      this.repo.periodComparison(
        userId,
        new Date(period1From),
        new Date(period1To),
        new Date(period2From),
        new Date(period2To),
        accountId,
      ),
    );
  }

  // ── 6. Spending trend ───────────────────────────────────────────────────

  async spendingTrend(userId: string, query: AnalyticsQueryDto) {
    const { from, to, accountId } = query;
    const cacheKey = this.key('spending-trend', userId, { from, to, accountId });
    return this.cached(cacheKey, TTL.spendingTrend, () =>
      this.repo.spendingTrend(
        userId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      ),
    );
  }

  // ── 7. Average transaction ──────────────────────────────────────────────

  async averageTransaction(userId: string, query: AnalyticsQueryDto) {
    const { from, to, accountId } = query;
    const cacheKey = this.key('average-transaction', userId, { from, to, accountId });
    return this.cached(cacheKey, TTL.averageTransaction, () =>
      this.repo.averageTransaction(
        userId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      ),
    );
  }

  // ── 8. Day of week ──────────────────────────────────────────────────────

  async dayOfWeek(userId: string, query: AnalyticsQueryDto) {
    const { from, to, accountId } = query;
    const cacheKey = this.key('day-of-week', userId, { from, to, accountId });
    return this.cached(cacheKey, TTL.dayOfWeek, () =>
      this.repo.dayOfWeek(
        userId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      ),
    );
  }

  // ── 9. Summary ──────────────────────────────────────────────────────────

  async summary(userId: string, accountId?: string) {
    const cacheKey = this.key('summary', userId, { accountId });
    return this.cached(cacheKey, TTL.summary, () =>
      this.repo.summary(userId, accountId),
    );
  }

  // ── 10. Top merchants ───────────────────────────────────────────────────

  async topMerchants(userId: string, query: AnalyticsQueryDto) {
    const { from, to, accountId, limit = 10 } = query;
    const cacheKey = this.key('top-merchants', userId, { from, to, accountId, limit });
    return this.cached(cacheKey, TTL.topMerchants, () =>
      this.repo.topMerchants(
        userId,
        limit,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      ),
    );
  }

  // ── 11. Income summary ──────────────────────────────────────────────────

  async incomeSummary(userId: string, query: AnalyticsQueryDto) {
    const { from, to, accountId } = query;
    const cacheKey = this.key('income-summary', userId, { from, to, accountId });
    return this.cached(cacheKey, TTL.incomeSummary, () =>
      this.repo.incomeSummary(
        userId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
        accountId,
      ),
    );
  }
}
