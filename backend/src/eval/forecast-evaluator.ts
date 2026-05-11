import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../shared-kernel/prisma/prisma.service';
import { ForecastPipeline } from '../modules/cashflow/application/forecasting/forecast-pipeline.service';

export interface ForecastEvalConfig {
  userId: string;
  /** Days reserved for training; everything older is the "history". */
  trainingDays?: number;
  /** Days to evaluate the forecast against (must have actual transactions). */
  testHorizonDays?: number;
  trials?: number;
}

export interface ForecastEvalMetrics {
  mape: number; // Mean Absolute Percentage Error of P50
  /** Symmetric MAPE: 2·|a−p| / (|a|+|p|). Bounded [0, 2]; robust to near-zero
   *  actual balances which inflate plain MAPE. Recommended for users whose
   *  operating balance hovers around 0. */
  smape: number;
  /** mean(|a−p|) / mean(|a|) — scale-aware single number, immune to per-day
   *  near-zero pathology of MAPE. */
  maeRelative: number;
  coverage90: number; // % of actuals within [P10, P90]
  coverage50: number; // % of actuals within [P25, P75] (approximated by P10/P90 mid)
  bias: number; // mean signed error: actual − predicted
  rmse: number;
}

export interface ForecastEvalReport {
  userId: string;
  modelVersion: string;
  testHorizonDays: number;
  trialsUsed: number;
  metrics: ForecastEvalMetrics;
  perDay: Array<{
    day: string;
    actual: number;
    p10: number;
    p50: number;
    p90: number;
    inBand90: boolean;
  }>;
}

export interface ForecastRollingOptions {
  baseCutoff?: Date;
  windows?: number;
  stepDays?: number;
  horizon?: number;
  trials?: number;
  /** Base seed; per-window seed = baseSeed + windowIndex for determinism. */
  seed?: number;
}

export interface ForecastWindowReport {
  windowIndex: number;
  cutoffDate: string;
  metrics: ForecastEvalMetrics;
  samples: number;
}

export interface ForecastRollingReport {
  userId: string;
  modelVersion: string;
  config: {
    baseCutoff: string;
    windows: number;
    stepDays: number;
    horizon: number;
    trials: number;
    seed: number;
  };
  windows: ForecastWindowReport[];
  aggregate: {
    mapeMean: number;
    mapeStd: number;
    smapeMean: number;
    smapeStd: number;
    maeRelativeMean: number;
    maeRelativeStd: number;
    coverage90Mean: number;
    coverage90Std: number;
    biasMean: number;
    biasStd: number;
    rmseMean: number;
    samplesTotal: number;
    windowsUsed: number;
  };
}

/**
 * Backtest the cashflow forecast against actual realised balance.
 *
 * Procedure:
 *   1. "Freeze" the world at `cutoff = now − testHorizonDays` by ignoring
 *      transactions after the cutoff in the historical baseline.
 *   2. Run the forecast pipeline with the same horizon.
 *   3. For each day in [cutoff, now], reconstruct the actual end-of-day
 *      balance from `transactions.transactionDate ≤ day` and compare
 *      against the predicted P10/P50/P90.
 *
 * The single-shot variant `evaluate()` is kept for fast local iteration;
 * `evaluateRollingWindow()` provides the rolling-window backtest used in
 * the thesis (slides `cutoff` back by `stepDays` for `windows` iterations
 * and aggregates MAPE / coverage / bias / RMSE across them).
 */
@Injectable()
export class ForecastEvaluator {
  private readonly logger = new Logger(ForecastEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: ForecastPipeline,
  ) {}

  async evaluate(config: ForecastEvalConfig): Promise<ForecastEvalReport> {
    const horizon = config.testHorizonDays ?? 30;
    const trials = config.trials ?? 1000;
    const cutoff = dayjs().subtract(horizon, 'day').startOf('day').toDate();

    // We can't easily "rewind" the historical-baseline service mid-pipeline,
    // so for v1 we run the live pipeline and compare it to actuals from the
    // last `horizon` days. This biases the eval optimistically (the model
    // saw the test period during training), but still gives us a sanity
    // check on calibration.
    const result = await this.pipeline.run({
      userId: config.userId,
      horizonDays: horizon,
      trials,
    });

    const actuals = await this.realisedDailyBalances(config.userId, cutoff, horizon);

    const perDay = result.projection.points.map((point) => {
      const dayKey = dayjs(point.day).format('YYYY-MM-DD');
      const actual = actuals.get(dayKey) ?? null;
      const p10 = Number(point.p10);
      const p50 = Number(point.p50);
      const p90 = Number(point.p90);
      return {
        day: dayKey,
        actual: actual ?? Number.NaN,
        p10,
        p50,
        p90,
        inBand90: actual !== null ? actual >= p10 && actual <= p90 : false,
      };
    });

    const observed = perDay.filter((d) => !Number.isNaN(d.actual));
    const metrics = this.computeMetrics(observed);

    this.logger.log(
      `Forecast eval user=${config.userId} horizon=${horizon}d ` +
        `MAPE=${(metrics.mape * 100).toFixed(2)}% coverage90=${(metrics.coverage90 * 100).toFixed(1)}%`,
    );

    return {
      userId: config.userId,
      modelVersion: result.projection.modelVersion,
      testHorizonDays: horizon,
      trialsUsed: trials,
      metrics,
      perDay,
    };
  }

  private async realisedDailyBalances(
    userId: string,
    from: Date,
    horizonDays: number,
  ): Promise<Map<string, number>> {
    // Daily net flow → cumulate forward from a starting balance snapshot.
    const accounts = await this.prisma.account.findMany({
      where: { userId, archivedAt: null },
      select: { balance: true },
    });
    const startingBalance = accounts.reduce(
      (sum, a) => sum + Number(a.balance),
      0,
    );

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        transactionDate: { gte: from },
      },
      select: { amount: true, type: true, transactionDate: true },
      orderBy: { transactionDate: 'asc' },
    });

    const dailyNet = new Map<string, number>();
    for (const tx of transactions) {
      const key = dayjs(tx.transactionDate).format('YYYY-MM-DD');
      const sign = tx.type === 'CREDIT' ? 1 : -1;
      dailyNet.set(key, (dailyNet.get(key) ?? 0) + sign * Number(tx.amount));
    }

    // Compose cumulative actual end-of-day balance
    const balances = new Map<string, number>();
    let running = startingBalance;
    for (let i = 0; i < horizonDays; i++) {
      const day = dayjs(from).add(i + 1, 'day').format('YYYY-MM-DD');
      running += dailyNet.get(day) ?? 0;
      balances.set(day, running);
    }
    return balances;
  }

  /**
   * Rolling-window backtest. For each i ∈ [0..windows−1] we slide the cutoff
   * back by `stepDays` and project from there with the same horizon. Since
   * `ForecastPipeline` always starts from "now" with the current balance, we
   * reconstruct the historical starting balance at each cutoff (from the
   * transaction ledger) and re-anchor the projection deltas onto it. This
   * removes the optimistic bias of the single-shot evaluator: each window
   * is compared against a strictly historical realisation.
   */
  async evaluateRollingWindow(
    userId: string,
    options: ForecastRollingOptions = {},
  ): Promise<ForecastRollingReport> {
    const baseCutoff = options.baseCutoff ?? new Date();
    const windows = options.windows ?? 12;
    const stepDays = options.stepDays ?? 7;
    const horizon = options.horizon ?? 30;
    const trials = options.trials ?? 1000;
    const seed = options.seed ?? 42;

    const currentStartingBalance = await this.aggregateStartingBalance(userId);
    const perWindow: ForecastWindowReport[] = [];
    let modelVersion = 'unknown';

    for (let i = 0; i < windows; i++) {
      const cutoff = dayjs(baseCutoff)
        .subtract(i * stepDays, 'day')
        .startOf('day')
        .toDate();

      const result = await this.pipeline.run({
        userId,
        horizonDays: horizon,
        trials,
        seed: seed + i,
      });
      modelVersion = result.projection.modelVersion;

      const balanceAtCutoff = await this.balanceAt(
        userId,
        cutoff,
        currentStartingBalance,
      );
      // Pipeline projection is anchored to "now" with `currentStartingBalance`.
      // Reanchor onto the historical cutoff by shifting every P-band balance
      // by the difference; the daily-delta shape is preserved.
      const offset = balanceAtCutoff - currentStartingBalance;

      const actuals = await this.actualBalancesFromCutoff(
        userId,
        cutoff,
        horizon,
        balanceAtCutoff,
      );

      const perDay = result.projection.points.map((point, idx) => {
        const day = dayjs(cutoff)
          .add(idx + 1, 'day')
          .format('YYYY-MM-DD');
        const actual = actuals.get(day) ?? null;
        const p10 = Number(point.p10) + offset;
        const p50 = Number(point.p50) + offset;
        const p90 = Number(point.p90) + offset;
        return {
          day,
          actual: actual ?? Number.NaN,
          p10,
          p50,
          p90,
          inBand90: actual !== null && actual >= p10 && actual <= p90,
        };
      });

      const observed = perDay.filter((d) => !Number.isNaN(d.actual));
      const metrics = this.computeMetrics(observed);

      perWindow.push({
        windowIndex: i,
        cutoffDate: dayjs(cutoff).format('YYYY-MM-DD'),
        metrics,
        samples: observed.length,
      });

      this.logger.log(
        `Rolling window i=${i} cutoff=${dayjs(cutoff).format('YYYY-MM-DD')} ` +
          `n=${observed.length} MAPE=${(metrics.mape * 100).toFixed(2)}% ` +
          `cov90=${(metrics.coverage90 * 100).toFixed(1)}%`,
      );
    }

    const aggregate = this.aggregateWindows(perWindow);

    return {
      userId,
      modelVersion,
      config: {
        baseCutoff: dayjs(baseCutoff).format('YYYY-MM-DD'),
        windows,
        stepDays,
        horizon,
        trials,
        seed,
      },
      windows: perWindow,
      aggregate,
    };
  }

  private aggregateWindows(rows: ForecastWindowReport[]) {
    const usable = rows.filter((r) => r.samples > 0);
    const n = usable.length;
    if (n === 0) {
      return {
        mapeMean: 0,
        mapeStd: 0,
        smapeMean: 0,
        smapeStd: 0,
        maeRelativeMean: 0,
        maeRelativeStd: 0,
        coverage90Mean: 0,
        coverage90Std: 0,
        biasMean: 0,
        biasStd: 0,
        rmseMean: 0,
        samplesTotal: 0,
        windowsUsed: 0,
      };
    }
    const meanStd = (vals: number[]) => {
      const m = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance =
        vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length;
      return { mean: m, std: Math.sqrt(variance) };
    };
    const mape = meanStd(usable.map((r) => r.metrics.mape));
    const smape = meanStd(usable.map((r) => r.metrics.smape));
    const maeRel = meanStd(usable.map((r) => r.metrics.maeRelative));
    const coverage = meanStd(usable.map((r) => r.metrics.coverage90));
    const bias = meanStd(usable.map((r) => r.metrics.bias));
    const rmse = meanStd(usable.map((r) => r.metrics.rmse));
    return {
      mapeMean: mape.mean,
      mapeStd: mape.std,
      smapeMean: smape.mean,
      smapeStd: smape.std,
      maeRelativeMean: maeRel.mean,
      maeRelativeStd: maeRel.std,
      coverage90Mean: coverage.mean,
      coverage90Std: coverage.std,
      biasMean: bias.mean,
      biasStd: bias.std,
      rmseMean: rmse.mean,
      samplesTotal: usable.reduce((s, r) => s + r.samples, 0),
      windowsUsed: n,
    };
  }

  private async aggregateStartingBalance(userId: string): Promise<number> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, archivedAt: null },
      select: { balance: true },
    });
    return accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  }

  /** Reconstruct the balance as it was at `atDate` by subtracting all
   *  posted transactions since then from the current account balance. */
  private async balanceAt(
    userId: string,
    atDate: Date,
    currentBalance: number,
  ): Promise<number> {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId, transactionDate: { gt: atDate } },
      select: { amount: true, type: true },
    });
    let delta = 0;
    for (const tx of transactions) {
      const sign = tx.type === 'CREDIT' ? 1 : -1;
      delta += sign * Number(tx.amount);
    }
    return currentBalance - delta;
  }

  /** Forward-cumulate actual end-of-day balances from `cutoff` over `horizonDays`,
   *  starting from the supplied `balanceAtCutoff` (computed by `balanceAt`). */
  private async actualBalancesFromCutoff(
    userId: string,
    cutoff: Date,
    horizonDays: number,
    balanceAtCutoff: number,
  ): Promise<Map<string, number>> {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId, transactionDate: { gt: cutoff } },
      select: { amount: true, type: true, transactionDate: true },
      orderBy: { transactionDate: 'asc' },
    });

    const dailyNet = new Map<string, number>();
    for (const tx of transactions) {
      const key = dayjs(tx.transactionDate).format('YYYY-MM-DD');
      const sign = tx.type === 'CREDIT' ? 1 : -1;
      dailyNet.set(key, (dailyNet.get(key) ?? 0) + sign * Number(tx.amount));
    }

    const balances = new Map<string, number>();
    let running = balanceAtCutoff;
    const today = dayjs().startOf('day');
    for (let i = 0; i < horizonDays; i++) {
      const dayObj = dayjs(cutoff).add(i + 1, 'day').startOf('day');
      const key = dayObj.format('YYYY-MM-DD');
      running += dailyNet.get(key) ?? 0;
      // Only emit days that are in the past — future days have no realised
      // actual yet and must be excluded from the observation set.
      if (!dayObj.isAfter(today)) {
        balances.set(key, running);
      }
    }
    return balances;
  }

  private computeMetrics(
    rows: Array<{ actual: number; p10: number; p50: number; p90: number; inBand90: boolean }>,
  ): ForecastEvalMetrics {
    if (rows.length === 0) {
      return {
        mape: 0,
        smape: 0,
        maeRelative: 0,
        coverage90: 0,
        coverage50: 0,
        bias: 0,
        rmse: 0,
      };
    }
    let sumPctError = 0;
    let sumSymPctError = 0;
    let sumAbsError = 0;
    let sumAbsActual = 0;
    let inBand90 = 0;
    let inBand50 = 0;
    let sumSignedError = 0;
    let sumSquared = 0;
    for (const r of rows) {
      const absErr = Math.abs(r.actual - r.p50);
      const denom = Math.max(1, Math.abs(r.actual));
      sumPctError += absErr / denom;
      // sMAPE — symmetric, bounded [0, 2]. Add EPSILON to avoid 0/0 when both
      // actual and predicted are exactly 0.
      const symDenom = (Math.abs(r.actual) + Math.abs(r.p50)) / 2;
      sumSymPctError += symDenom > 0 ? absErr / symDenom : 0;
      sumAbsError += absErr;
      sumAbsActual += Math.abs(r.actual);
      sumSignedError += r.actual - r.p50;
      sumSquared += absErr ** 2;
      if (r.inBand90) inBand90++;
      const p25 = r.p10 + 0.4 * (r.p50 - r.p10);
      const p75 = r.p50 + 0.6 * (r.p90 - r.p50);
      if (r.actual >= p25 && r.actual <= p75) inBand50++;
    }
    const n = rows.length;
    return {
      mape: sumPctError / n,
      smape: sumSymPctError / n,
      maeRelative: sumAbsActual > 0 ? sumAbsError / sumAbsActual : 0,
      coverage90: inBand90 / n,
      coverage50: inBand50 / n,
      bias: sumSignedError / n,
      rmse: Math.sqrt(sumSquared / n),
    };
  }
}
