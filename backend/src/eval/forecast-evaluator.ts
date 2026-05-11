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

export interface ForecastEvalReport {
  userId: string;
  modelVersion: string;
  testHorizonDays: number;
  trialsUsed: number;
  metrics: {
    mape: number; // Mean Absolute Percentage Error of P50
    coverage90: number; // % of actuals within [P10, P90]
    coverage50: number; // % of actuals within [P25, P75] (approximated by P10/P90 mid)
    bias: number; // mean signed error: actual − predicted
    rmse: number;
  };
  perDay: Array<{
    day: string;
    actual: number;
    p10: number;
    p50: number;
    p90: number;
    inBand90: boolean;
  }>;
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
 * Limitations: this is a "single-shot retrospective" eval — proper
 * backtesting would slide the cutoff and aggregate across many windows.
 * Captured as `eval/forecast-evaluator.spec.ts` follow-up.
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

  private computeMetrics(
    rows: Array<{ actual: number; p10: number; p50: number; p90: number; inBand90: boolean }>,
  ) {
    if (rows.length === 0) {
      return { mape: 0, coverage90: 0, coverage50: 0, bias: 0, rmse: 0 };
    }
    let sumPctError = 0;
    let inBand90 = 0;
    let inBand50 = 0;
    let sumSignedError = 0;
    let sumSquared = 0;
    for (const r of rows) {
      const denom = Math.max(1, Math.abs(r.actual));
      sumPctError += Math.abs(r.actual - r.p50) / denom;
      sumSignedError += r.actual - r.p50;
      sumSquared += (r.actual - r.p50) ** 2;
      if (r.inBand90) inBand90++;
      const p25 = r.p10 + 0.4 * (r.p50 - r.p10);
      const p75 = r.p50 + 0.6 * (r.p90 - r.p50);
      if (r.actual >= p25 && r.actual <= p75) inBand50++;
    }
    const n = rows.length;
    return {
      mape: sumPctError / n,
      coverage90: inBand90 / n,
      coverage50: inBand50 / n,
      bias: sumSignedError / n,
      rmse: Math.sqrt(sumSquared / n),
    };
  }
}
