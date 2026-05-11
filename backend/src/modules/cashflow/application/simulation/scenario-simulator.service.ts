import { Inject, Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { CashFlowProjection } from '../../domain/projection.entity';
import { Scenario, ScenarioOutcome, ScenarioVariableKind } from '../../domain/scenario.entity';
import { RecurringDetector, RecurringFlow } from '../forecasting/recurring-detector.service';
import { HistoricalBaselineService } from '../forecasting/historical-baseline.service';
import { MonteCarloSimulator } from '../forecasting/monte-carlo-simulator.service';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';
import {
  PROJECTION_REPOSITORY,
  ProjectionRepository,
} from '../../domain/repositories.interface';

/**
 * Re-runs the Monte Carlo simulation with `scenario.variables` applied
 * on top of the user's current baseline; computes per-metric deltas
 * vs the baseline projection.
 *
 * Variables supported:
 *   - INCOME_DELTA      → adds/removes monthly inflow
 *   - CATEGORY_DELTA    → scales the historical mean for spending
 *                         (proxied via stdDaily/meanByDow scaling)
 *   - NEW_GOAL          → adds an outflow recurring stream
 *                         representing monthly contribution
 *   - NEW_RECURRING     → adds an inflow or outflow recurring stream
 */
@Injectable()
export class ScenarioSimulator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recurring: RecurringDetector,
    private readonly baseline: HistoricalBaselineService,
    private readonly simulator: MonteCarloSimulator,
    @Inject(PROJECTION_REPOSITORY)
    private readonly projections: ProjectionRepository,
  ) {}

  async simulate(scenario: Scenario, baselineProjection: CashFlowProjection): Promise<ScenarioOutcome[]> {
    const userId = scenario.userId;
    const horizon = baselineProjection.horizonDays;

    const startingBalance = await this.aggregateStartingBalance(userId);
    const baseRecurring = await this.recurring.detect(userId);
    const baseDist = await this.baseline.compute(userId);

    // Apply scenario mutations to a copy.
    const modifiedRecurring: RecurringFlow[] = [...baseRecurring];
    let modifiedDist = { ...baseDist, meanByDow: [...baseDist.meanByDow] };

    for (const v of scenario.variables) {
      this.applyVariable(v, modifiedRecurring, modifiedDist);
      // CATEGORY_DELTA mutates the dist immutably:
      if (v.kind === 'CATEGORY_DELTA') {
        const factor = 1 + v.deltaPct / 100;
        modifiedDist = {
          ...modifiedDist,
          meanByDow: modifiedDist.meanByDow.map((m) => m * factor),
        };
      }
    }

    const sim = this.simulator.simulate({
      startingBalance,
      horizonDays: horizon,
      baseline: modifiedDist,
      recurring: modifiedRecurring,
      trials: 1000,
    });

    return this.computeOutcomes(baselineProjection, sim, modifiedDist, baseDist);
  }

  private applyVariable(
    v: ScenarioVariableKind,
    recurring: RecurringFlow[],
    _dist: ReturnType<HistoricalBaselineService['compute']> extends Promise<infer X> ? X : never,
  ): void {
    switch (v.kind) {
      case 'INCOME_DELTA':
        recurring.push({
          description: v.reason ?? 'scenario:income-delta',
          amountMonthly: Math.abs(v.deltaMonthly),
          sign: v.deltaMonthly >= 0 ? 'INFLOW' : 'OUTFLOW',
          source: 'pattern',
          nextDueDate: null,
          cadence: 'monthly',
        });
        return;
      case 'NEW_GOAL':
        recurring.push({
          description: `scenario:goal:${v.name}`,
          amountMonthly: v.monthlyContribution,
          sign: 'OUTFLOW',
          source: 'pattern',
          nextDueDate: null,
          cadence: 'monthly',
        });
        return;
      case 'NEW_RECURRING':
        recurring.push({
          description: `scenario:${v.description}`,
          amountMonthly: v.amountMonthly,
          sign: v.sign,
          source: 'pattern',
          nextDueDate: null,
          cadence: 'monthly',
        });
        return;
      case 'CATEGORY_DELTA':
        // handled at distribution scaling above
        return;
    }
  }

  private async aggregateStartingBalance(userId: string): Promise<number> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, archivedAt: null },
      select: { balance: true },
    });
    return accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  }

  private computeOutcomes(
    baseline: CashFlowProjection,
    modifiedSim: ReturnType<MonteCarloSimulator['simulate']>,
    modifiedDist: { meanByDow: number[] },
    baseDist: { meanByDow: number[] },
  ): ScenarioOutcome[] {
    const points = baseline.points;

    const baselineEnd = points.length > 0 ? Number(points[points.length - 1]!.p50) : 0;
    const modifiedEnd =
      modifiedSim.perDay.length > 0
        ? modifiedSim.perDay[modifiedSim.perDay.length - 1]!.balanceP50
        : 0;

    const baselineDeficitDay = points.find((p) => Number(p.p50) <= 0);
    const modifiedDeficitDay = modifiedSim.perDay.find((d) => d.balanceP50 <= 0);
    const baselineFirstDeficit = baselineDeficitDay
      ? dayjs(baselineDeficitDay.day).diff(dayjs().startOf('day'), 'day')
      : -1;
    const modifiedFirstDeficit = modifiedDeficitDay
      ? dayjs(modifiedDeficitDay.day).diff(dayjs().startOf('day'), 'day')
      : -1;

    const baselineMeanOut =
      baseDist.meanByDow.reduce((s, v) => s + v, 0) / baseDist.meanByDow.length;
    const modifiedMeanOut =
      modifiedDist.meanByDow.reduce((s, v) => s + v, 0) / modifiedDist.meanByDow.length;

    const outcomes: ScenarioOutcome[] = [
      this.metric('end_balance_p50', baselineEnd, modifiedEnd),
      this.metric('first_deficit_day', baselineFirstDeficit, modifiedFirstDeficit),
      this.metric('mean_daily_outflow', baselineMeanOut, modifiedMeanOut),
    ];
    return outcomes;
  }

  private metric(key: string, baseline: number, modified: number): ScenarioOutcome {
    const delta = modified - baseline;
    const deltaPct = baseline !== 0 ? (delta / Math.abs(baseline)) * 100 : 0;
    return {
      metricKey: key,
      baseline,
      modified,
      delta,
      deltaPct,
    };
  }
}
