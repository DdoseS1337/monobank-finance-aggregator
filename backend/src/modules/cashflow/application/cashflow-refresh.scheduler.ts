import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { ForecastPipeline } from './forecasting/forecast-pipeline.service';
import { GoalsService } from '../../goals/application/goals.service';

/**
 * Worker-only scheduler. Lives in WorkersModule so the API process does
 * not run cron jobs (only one process should drive these).
 *
 *   02:00 UTC — refresh cashflow projection for every active user
 *   03:00 UTC — recompute goal feasibility (per-user) — Phase 2 deterministic
 *               estimate; the Phase-3 hook here lets us swap to
 *               Monte-Carlo-backed feasibility once `Goal.computeFeasibility`
 *               is rewired to depend on the latest CashFlowProjection.
 */
@Injectable()
export class CashflowRefreshScheduler {
  private readonly logger = new Logger(CashflowRefreshScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: ForecastPipeline,
    private readonly goals: GoalsService,
  ) {}

  @Cron('0 2 * * *', { name: 'cashflow:nightly-refresh', timeZone: 'UTC' })
  async nightlyForecastRefresh(): Promise<void> {
    const users = await this.activeUsers();
    if (users.length === 0) return;
    this.logger.log(`Cashflow nightly refresh: ${users.length} active users`);
    let ok = 0;
    let failed = 0;
    for (const userId of users) {
      try {
        await this.pipeline.run({ userId });
        ok++;
      } catch (error) {
        this.logger.error(
          `Cashflow refresh failed for user ${userId}: ${(error as Error).message}`,
        );
        failed++;
      }
    }
    this.logger.log(`Cashflow nightly refresh done: ok=${ok} failed=${failed}`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'goals:feasibility-recalc' })
  async nightlyGoalFeasibilityRecalc(): Promise<void> {
    const users = await this.activeUsers();
    if (users.length === 0) return;
    let total = 0;
    for (const userId of users) {
      try {
        total += await this.goals.recalculateFeasibilityForUser(userId);
      } catch (error) {
        this.logger.error(
          `Goal feasibility recalc failed for user ${userId}: ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(`Goal feasibility recalc done: ${total} goals updated`);
  }

  /** Users that have at least one active account — drives both jobs. */
  private async activeUsers(): Promise<string[]> {
    const rows = await this.prisma.account.findMany({
      where: { archivedAt: null },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }
}
