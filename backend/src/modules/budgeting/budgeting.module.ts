import { Module } from '@nestjs/common';
import { BudgetingController } from './presentation/budgeting.controller';
import { BudgetingService } from './application/budgeting.service';
import { BudgetLifecycleSaga } from './application/budget-lifecycle.saga';
import { PrismaBudgetRepository } from './infrastructure/budget.repository';
import { PrismaEnvelopeRepository } from './infrastructure/envelope.repository';
import {
  BUDGET_REPOSITORY,
  ENVELOPE_REPOSITORY,
} from './domain/repositories.interface';

/**
 * Budgeting Context — Phase 2.1.
 * Aggregates: Budget, EnvelopeBucket
 * Methods supported: CATEGORY, ENVELOPE, ZERO_BASED, PAY_YOURSELF_FIRST
 *
 * The BudgetLifecycleSaga is a BullMQ Processor; in the API process it is
 * inert (no worker is bound). It does real work only inside the worker
 * process via WorkersModule, where it consumes the `budgets` queue.
 */
@Module({
  controllers: [BudgetingController],
  providers: [
    BudgetingService,
    BudgetLifecycleSaga,
    { provide: BUDGET_REPOSITORY, useClass: PrismaBudgetRepository },
    { provide: ENVELOPE_REPOSITORY, useClass: PrismaEnvelopeRepository },
  ],
  exports: [BudgetingService, BudgetLifecycleSaga],
})
export class BudgetingModule {}
