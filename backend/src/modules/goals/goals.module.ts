import { Module } from '@nestjs/common';
import { GoalsController } from './presentation/goals.controller';
import { GoalsService } from './application/goals.service';
import { PrismaGoalRepository } from './infrastructure/goal.repository';
import { GOAL_REPOSITORY } from './domain/repositories.interface';

/**
 * Goal Planning Context — Phase 2.2.
 *
 * Aggregates: FinancialGoal.
 *
 * Phase-2 feasibility = deterministic pace estimate. Phase 3 will replace
 * this with Monte Carlo against the cashflow forecast (interface stays
 * stable: Goal.computeFeasibility()).
 */
@Module({
  controllers: [GoalsController],
  providers: [
    GoalsService,
    { provide: GOAL_REPOSITORY, useClass: PrismaGoalRepository },
  ],
  exports: [GoalsService],
})
export class GoalsModule {}
