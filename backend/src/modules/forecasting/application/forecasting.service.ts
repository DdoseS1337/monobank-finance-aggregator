import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RedisService } from '../../../redis/redis.service';
import { ForecastingRepository } from '../infrastructure/forecasting.repository';
import { ForecastingQueryDto } from '../presentation/dto/forecasting-query.dto';
import {
  CashFlowForecast,
  EndOfMonthProjection,
  CategoryForecast,
  BurnRate,
  ForecastPoint,
  ForecastModel,
} from '../domain/forecast.interfaces';
import {
  forecastByModel,
  ensemble,
  holtSmoothing,
  linearTrend,
  mean,
  stdDev,
} from './forecast-algorithms';

const TTL = {
  cashFlow: 900,
  endOfMonth: 600,
  categories: 1800,
  burnRate: 600,
};

const MS_PER_DAY = 86400000;

@Injectable()
export class ForecastingService {
  constructor(
    private readonly repo: ForecastingRepository,
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
    return `forecast:${endpoint}:${userId}:${stable}`;
  }

  private addDays(d: Date, n: number): Date {
    return new Date(d.getTime() + n * MS_PER_DAY);
  }

  private fmtDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /* ════════════════════════════════════════════════════════════════════════
     1. CASH-FLOW FORECAST
     Predicts future daily *net* flow, then accumulates onto current balance
     ════════════════════════════════════════════════════════════════════════ */

  async cashFlow(userId: string, query: ForecastingQueryDto): Promise<CashFlowForecast> {
    const { accountId, horizonDays = 30, model = 'ensemble', lookbackDays = 180 } = query;
    const cacheKey = this.key('cash-flow', userId, {
      accountId, horizonDays, model, lookbackDays,
    });

    return this.cached(cacheKey, TTL.cashFlow, async () => {
      const now = new Date();
      const from = this.addDays(now, -lookbackDays);

      const [series, currentBalance] = await Promise.all([
        this.repo.dailySeries(userId, from, now, accountId),
        this.repo.currentBalance(userId, accountId),
      ]);

      const expenseSeries = series.map((p) => p.expense);
      const incomeSeries = series.map((p) => p.income);

      // Forecast expense and income independently
      const expForecast = forecastByModel(expenseSeries, horizonDays, model);
      const incForecast = forecastByModel(incomeSeries, horizonDays, model);

      // Combined MAPE — average of the two (expense is usually the more meaningful one)
      const combinedMape = (expForecast.mape + incForecast.mape) / 2;

      // Build history points (last 60 days capped) with cumulative balance back-calculated
      const historyDays = Math.min(60, series.length);
      const historySlice = series.slice(-historyDays);

      // Reconstruct historical balance by rolling back from currentBalance
      const totalNetAfter = historySlice.reduce(
        (s, p) => s + p.income - p.expense, 0,
      );
      let runBal = currentBalance - totalNetAfter;
      const history: ForecastPoint[] = historySlice.map((p) => {
        runBal += p.income - p.expense;
        return {
          date: this.fmtDate(p.date),
          predicted: runBal.toFixed(2),
          lowerBound: runBal.toFixed(2),
          upperBound: runBal.toFixed(2),
          isPredicted: false,
        };
      });

      // Forecast points — cumulative net applied to balance
      let bal = currentBalance;
      let balLo = currentBalance;
      let balHi = currentBalance;
      let willRunOut = false;
      let runOutDate: string | null = null;

      const forecast: ForecastPoint[] = [];
      for (let i = 0; i < horizonDays; i++) {
        const netPredicted = incForecast.predicted[i] - expForecast.predicted[i];
        // Pessimistic = lower income + upper expense; optimistic = opposite
        const netPessimistic = incForecast.lower[i] - expForecast.upper[i];
        const netOptimistic = incForecast.upper[i] - expForecast.lower[i];

        bal += netPredicted;
        balLo += netPessimistic;
        balHi += netOptimistic;

        const date = this.fmtDate(this.addDays(now, i + 1));

        if (!willRunOut && bal < 0) {
          willRunOut = true;
          runOutDate = date;
        }

        forecast.push({
          date,
          predicted: bal.toFixed(2),
          lowerBound: balLo.toFixed(2),
          upperBound: balHi.toFixed(2),
          isPredicted: true,
        });
      }

      return {
        currentBalance: currentBalance.toFixed(2),
        history,
        forecast,
        model,
        accuracyMape: combinedMape.toFixed(1),
        willRunOut,
        runOutDate,
      };
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     2. END-OF-MONTH PROJECTION
     How much will I spend by the end of this month?
     ════════════════════════════════════════════════════════════════════════ */

  async endOfMonth(userId: string, query: ForecastingQueryDto): Promise<EndOfMonthProjection> {
    const { accountId } = query;
    const cacheKey = this.key('end-of-month', userId, { accountId });

    return this.cached(cacheKey, TTL.endOfMonth, async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const daysInMonth = monthEnd.getDate();
      const daysElapsed = now.getDate();
      const daysRemaining = daysInMonth - daysElapsed;

      // Pull both current month and previous 90 days for context
      const lookbackStart = this.addDays(now, -90);
      const series = await this.repo.dailySeries(userId, lookbackStart, now, accountId);

      // Current-month actual
      const currentMonth = series.filter((p) => p.date >= monthStart);
      const actualToDate = currentMonth.reduce((s, p) => s + p.expense, 0);

      // Historical daily expense for forecast (excluding today partial if it's empty)
      const expenses = series.map((p) => p.expense);

      // Use ensemble model for robustness
      const forecast = ensemble(expenses, daysRemaining);
      const projectedRemaining = forecast.predicted.reduce((a, b) => a + b, 0);
      const projectedTotal = actualToDate + projectedRemaining;

      // Pessimistic / optimistic via upper/lower bounds of remaining days
      const pessimisticRemaining = forecast.upper.reduce((a, b) => a + b, 0);
      const optimisticRemaining = forecast.lower.reduce((a, b) => a + b, 0);
      const pessimistic = actualToDate + pessimisticRemaining;
      const optimistic = actualToDate + optimisticRemaining;

      // Pace analysis
      const avgDaily = mean(expenses);
      const expectedByNow = avgDaily * daysElapsed;
      const paceRatio = expectedByNow > 0 ? actualToDate / expectedByNow : 1;
      const paceStatus: 'under' | 'on_track' | 'over' =
        paceRatio < 0.9 ? 'under' : paceRatio > 1.1 ? 'over' : 'on_track';

      return {
        monthStart: this.fmtDate(monthStart),
        monthEnd: this.fmtDate(monthEnd),
        daysElapsed,
        daysRemaining,
        actualToDate: actualToDate.toFixed(2),
        projectedTotal: projectedTotal.toFixed(2),
        projectedRemaining: projectedRemaining.toFixed(2),
        pessimistic: pessimistic.toFixed(2),
        realistic: projectedTotal.toFixed(2),
        optimistic: optimistic.toFixed(2),
        spendingPace: paceRatio.toFixed(2),
        paceStatus,
      };
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     3. PER-CATEGORY FORECASTS
     For each category: trend, average, projection for current month
     ════════════════════════════════════════════════════════════════════════ */

  async byCategory(userId: string, query: ForecastingQueryDto): Promise<CategoryForecast[]> {
    const { accountId, lookbackDays = 365 } = query;
    const cacheKey = this.key('by-category', userId, { accountId, lookbackDays });

    return this.cached(cacheKey, TTL.categories, async () => {
      const now = new Date();
      const from = this.addDays(now, -lookbackDays);

      const rows = await this.repo.categoryMonthlyHistory(userId, from, now, accountId);

      // Group rows by category → ordered array of monthly totals
      const byCat = new Map<string, { month: Date; total: number }[]>();
      for (const r of rows) {
        const list = byCat.get(r.category) ?? [];
        list.push({ month: new Date(r.month), total: Number(r.total) });
        byCat.set(r.category, list);
      }

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysElapsed = now.getDate();
      const fractionOfMonth = daysElapsed / daysInMonth;

      const results: CategoryForecast[] = [];

      for (const [category, list] of byCat) {
        // Drop the current (partial) month for trend analysis
        const historical = list.filter((m) => m.month < monthStart);
        if (historical.length === 0) continue;

        const totals = historical.map((m) => m.total);
        const avg = mean(totals);
        const lastMonth = totals[totals.length - 1];
        const monthsCount = totals.length;

        // Linear trend on monthly data
        const trendResult = totals.length >= 2
          ? linearTrend(totals, 1)
          : { predicted: [avg], mape: 0, lower: [avg], upper: [avg], residualStd: 0 };

        // Holt's for more stable projection if we have enough history
        const holtResult = totals.length >= 3
          ? holtSmoothing(totals, 1)
          : trendResult;

        // Ensemble the two for the final monthly projection
        const monthlyProjection = (trendResult.predicted[0] + holtResult.predicted[0]) / 2;

        // Growth trend (% per month)
        const trendPct = totals.length >= 2 && totals[0] > 0
          ? (((totals[totals.length - 1] - totals[0]) / totals[0]) / (totals.length - 1)) * 100
          : 0;

        // Confidence: more history + lower variance ⇒ higher
        const variance = stdDev(totals);
        const cv = avg > 0 ? variance / avg : 1;
        const historyFactor = Math.min(1, monthsCount / 6); // 6+ months saturates
        const varianceFactor = Math.max(0, 1 - cv);
        const confidence = Math.max(0, Math.min(1, historyFactor * 0.5 + varianceFactor * 0.5));

        results.push({
          category,
          avgMonthlySpend: new Prisma.Decimal(avg).toFixed(2),
          lastMonthSpend: new Prisma.Decimal(lastMonth).toFixed(2),
          projectedThisMonth: new Prisma.Decimal(Math.max(0, monthlyProjection)).toFixed(2),
          trendPct: trendPct.toFixed(1),
          confidence: Math.round(confidence * 100) / 100,
          monthsOfHistory: monthsCount,
        });
      }

      // Sort by projected spend descending
      results.sort(
        (a, b) => Number(b.projectedThisMonth) - Number(a.projectedThisMonth),
      );

      return results;
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     4. BURN RATE
     How long until the balance hits zero at current spending pace?
     ════════════════════════════════════════════════════════════════════════ */

  async burnRate(userId: string, query: ForecastingQueryDto): Promise<BurnRate> {
    const { accountId, lookbackDays = 60 } = query;
    const cacheKey = this.key('burn-rate', userId, { accountId, lookbackDays });

    return this.cached(cacheKey, TTL.burnRate, async () => {
      const now = new Date();
      const from = this.addDays(now, -lookbackDays);

      const [series, currentBalance] = await Promise.all([
        this.repo.dailySeries(userId, from, now, accountId),
        this.repo.currentBalance(userId, accountId),
      ]);

      const avgExpense = mean(series.map((p) => p.expense));
      const avgIncome = mean(series.map((p) => p.income));
      const netBurn = avgExpense - avgIncome; // positive = net outflow

      let daysUntilEmpty: number | null = null;
      let projectedEmptyDate: string | null = null;

      if (netBurn > 0 && currentBalance > 0) {
        daysUntilEmpty = Math.floor(currentBalance / netBurn);
        projectedEmptyDate = this.fmtDate(this.addDays(now, daysUntilEmpty));
      }

      return {
        currentBalance: currentBalance.toFixed(2),
        avgDailyBurn: avgExpense.toFixed(2),
        avgDailyIncome: avgIncome.toFixed(2),
        netDailyBurn: netBurn.toFixed(2),
        daysUntilEmpty,
        projectedEmptyDate,
        sustainable: netBurn <= 0,
      };
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     5. MODEL COMPARISON — run all models, return accuracy side-by-side
     Useful for dashboard "best model" badge
     ════════════════════════════════════════════════════════════════════════ */

  async modelComparison(
    userId: string,
    query: ForecastingQueryDto,
  ): Promise<{ model: ForecastModel; mape: string; residualStd: string }[]> {
    const { accountId, horizonDays = 30, lookbackDays = 180 } = query;
    const cacheKey = this.key('model-comparison', userId, {
      accountId, horizonDays, lookbackDays,
    });

    return this.cached(cacheKey, TTL.cashFlow, async () => {
      const now = new Date();
      const from = this.addDays(now, -lookbackDays);
      const series = await this.repo.dailySeries(userId, from, now, accountId);
      const expenses = series.map((p) => p.expense);

      const models: ForecastModel[] = [
        'moving_average',
        'linear_trend',
        'seasonal_naive',
        'exponential_smoothing',
        'ensemble',
      ];

      return models
        .map((m) => {
          const result = forecastByModel(expenses, horizonDays, m);
          return {
            model: m,
            mape: result.mape.toFixed(2),
            residualStd: result.residualStd.toFixed(2),
          };
        })
        .sort((a, b) => Number(a.mape) - Number(b.mape));
    });
  }
}
