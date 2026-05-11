import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import Decimal from 'decimal.js';
import { Currency, Money } from '../../../shared-kernel/money/money';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { QUEUE_NAMES } from '../../../shared-kernel/queues/queue-names';
import { BudgetingService } from './budgeting.service';
import {
  BudgetLineExceededCritical,
  BudgetLineExceededWarning,
} from '../domain/events/budget-events';

interface OutboxEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

interface TransactionCategorizedPayload {
  transactionId: string;
  userId: string;
  categoryId: string;
  amount: string;
  currency: Currency;
  type: 'DEBIT' | 'CREDIT';
}

/**
 * Worker that listens to events routed to the `budgets` queue and applies
 * spending to the matching budget line. After persisting the spend it
 * checks whether a threshold was crossed and emits the corresponding
 * BudgetLineExceeded event so downstream contexts (recommendations,
 * notifications) can react.
 */
@Processor(QUEUE_NAMES.budgets)
@Injectable()
export class BudgetLifecycleSaga extends WorkerHost {
  private readonly logger = new Logger(BudgetLifecycleSaga.name);

  constructor(
    private readonly budgeting: BudgetingService,
    private readonly eventBus: DomainEventBus,
  ) {
    super();
  }

  async process(job: Job<OutboxEnvelope>): Promise<void> {
    if (job.data.eventType !== 'transaction.categorized') {
      return;
    }
    const event = job.data as OutboxEnvelope<TransactionCategorizedPayload>;
    const { userId, categoryId, amount, currency, type } = event.payload;
    if (type !== 'DEBIT') return;

    const money = Money.of(new Decimal(amount).abs(), currency);
    let result;
    try {
      result = await this.budgeting.applyCategorizedSpending({
        userId,
        categoryId,
        amount: money,
      });
    } catch (error) {
      this.logger.error(
        `Failed to apply spending for tx ${event.payload.transactionId}: ${(error as Error).message}`,
      );
      throw error;
    }
    if (!result) return;
    const { budget, matchedLineCategoryId } = result;

    const period = budget.currentPeriod();
    if (!period) return;
    const line = period.findLineByCategory(matchedLineCategoryId);
    if (!line) return;

    const pct = line.spentPct();
    if (line.isExceeded()) {
      await this.eventBus.publish(
        new BudgetLineExceededCritical(budget.id, {
          budgetId: budget.id,
          periodId: period.id,
          lineId: line.id,
          categoryId: matchedLineCategoryId,
          spentPct: pct,
          spentAmount: line.spentAmount.toFixed(2),
          plannedAmount: line.plannedAmount.toFixed(2),
        }, { userId, correlationId: event.eventId }),
      );
    } else if (line.isAtRisk()) {
      await this.eventBus.publish(
        new BudgetLineExceededWarning(budget.id, {
          budgetId: budget.id,
          periodId: period.id,
          lineId: line.id,
          categoryId: matchedLineCategoryId,
          spentPct: pct,
          spentAmount: line.spentAmount.toFixed(2),
          plannedAmount: line.plannedAmount.toFixed(2),
        }, { userId, correlationId: event.eventId }),
      );
    }
  }
}
