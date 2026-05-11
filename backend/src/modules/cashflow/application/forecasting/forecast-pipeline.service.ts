import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';
import { CashFlowProjection } from '../../domain/projection.entity';
import { ProjectionPoint } from '../../domain/value-objects/projection-point.vo';
import {
  PROJECTION_REPOSITORY,
  ProjectionRepository,
} from '../../domain/repositories.interface';
import { RecurringDetector, RecurringFlow } from './recurring-detector.service';
import {
  HistoricalBaselineService,
  DailyDistribution,
} from './historical-baseline.service';
import { MonteCarloSimulator } from './monte-carlo-simulator.service';
import { DeficitDetectorService } from '../deficit-detector.service';

const MODEL_VERSION = 'baseline-mc-v1';
const DEFAULT_HORIZON_DAYS = 60;
const DEFAULT_TRIALS = 1000;

export interface ForecastResult {
  projection: CashFlowProjection;
  trialsRun: number;
  deficitProbability: number;
}

/**
 * High-level orchestrator for a single forecast run.
 *
 *   1. Resolve user's starting balance — sum across active accounts.
 *   2. Detect recurring inflows / outflows (subscriptions, salary, patterns).
 *   3. Compute historical daily distribution per day-of-week.
 *   4. Run Monte Carlo for `horizonDays` × `trials` trajectories.
 *   5. Compose ProjectionPoint[] with P10/P50/P90 + deterministic expected
 *      flows.
 *   6. Persist as latest projection (demotes previous).
 *   7. Hand off to DeficitDetector to flag negative-balance windows.
 *
 * The whole pipeline is idempotent — running twice in a row produces
 * the same shape; only the random seed differs unless one is supplied.
 */
@Injectable()
export class ForecastPipeline {
  private readonly logger = new Logger(ForecastPipeline.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recurring: RecurringDetector,
    private readonly baseline: HistoricalBaselineService,
    private readonly simulator: MonteCarloSimulator,
    private readonly deficits: DeficitDetectorService,
    @Inject(PROJECTION_REPOSITORY)
    private readonly projections: ProjectionRepository,
  ) {}

  async run(input: {
    userId: string;
    horizonDays?: number;
    trials?: number;
    seed?: number;
  }): Promise<ForecastResult> {
    const horizon = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
    const trials = input.trials ?? DEFAULT_TRIALS;
    const startTime = Date.now();

    const startingBalance = await this.aggregateStartingBalance(input.userId);
    const recurring = await this.recurring.detect(input.userId);
    // Pass recurring to baseline so it can subtract their expected daily
    // contribution — otherwise the MC simulator double-counts them.
    const baseline = await this.baseline.compute(input.userId, 90, recurring);

    const sim = this.simulator.simulate({
      startingBalance,
      horizonDays: horizon,
      baseline,
      recurring,
      trials,
      seed: input.seed,
    });

    const points = sim.perDay.map(
      (d) =>
        new ProjectionPoint({
          day: d.day,
          balanceP10: new Decimal(d.balanceP10),
          balanceP50: new Decimal(d.balanceP50),
          balanceP90: new Decimal(d.balanceP90),
          expectedInflow: new Decimal(d.expectedInflow),
          expectedOutflow: new Decimal(d.expectedOutflow),
          hasDeficitRisk: d.balanceP10 < 0,
        }),
    );

    const projection = CashFlowProjection.create({
      id: randomUUID(),
      userId: input.userId,
      horizonDays: horizon,
      generatedAt: new Date(),
      modelVersion: MODEL_VERSION,
      confidenceScore: this.confidenceFromSample(baseline, sim.deficitProbability),
      assumptions: this.buildAssumptions(startingBalance, recurring, baseline),
      points,
    });

    await this.projections.saveAsLatest(projection);
    await this.deficits.scanAndFlag(projection);

    this.logger.log(
      `Forecast for user ${input.userId}: horizon=${horizon}d trials=${trials} ` +
        `deficit_prob=${(sim.deficitProbability * 100).toFixed(1)}% ` +
        `model=${MODEL_VERSION} took=${Date.now() - startTime}ms`,
    );

    return {
      projection,
      trialsRun: sim.trialsRun,
      deficitProbability: sim.deficitProbability,
    };
  }

  private async aggregateStartingBalance(userId: string): Promise<number> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, archivedAt: null },
      select: { balance: true },
    });
    return accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  }

  /**
   * Confidence proxy in [0..1]:
   *   - More observations → more confidence.
   *   - Higher uncertainty (stdDaily relative to mean) → less confidence.
   *   - Pure heuristic; replaced by proper calibration in Phase 7 (eval).
   */
  private confidenceFromSample(
    dist: DailyDistribution,
    deficitProb: number,
  ): number {
    if (dist.observations === 0) return 0.3;
    const obsScore = Math.min(1, dist.observations / 200);
    const meanOut = dist.meanByDow.reduce((s, v) => s + v, 0) / 7 || 1;
    const noiseRatio = dist.stdDaily / Math.max(meanOut, 1);
    const noiseScore = 1 - Math.min(1, noiseRatio);
    const score = 0.6 * obsScore + 0.4 * noiseScore;
    // Reduce slightly when deficit looks high — model is less reliable at the edge.
    return Math.max(0.1, Math.min(0.99, score - 0.1 * deficitProb));
  }

  private buildAssumptions(
    startingBalance: number,
    recurring: RecurringFlow[],
    baseline: DailyDistribution,
  ) {
    return [
      {
        key: 'starting_balance',
        value: startingBalance.toFixed(2),
        source: 'historical' as const,
      },
      {
        key: 'recurring_count',
        value: recurring.length,
        source: 'recurring' as const,
      },
      {
        key: 'baseline_observations',
        value: baseline.observations,
        source: 'historical' as const,
      },
      {
        key: 'mean_inflow_daily',
        value: Number(baseline.meanInflowDaily.toFixed(2)),
        source: 'historical' as const,
      },
      {
        key: 'std_outflow_daily',
        value: Number(baseline.stdDaily.toFixed(2)),
        source: 'historical' as const,
      },
    ];
  }
}
