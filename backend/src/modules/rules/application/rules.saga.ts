import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../../shared-kernel/queues/queue-names';
import { RulesEngine } from '../engine/rules-engine';
import { EvaluationContext } from '../domain/rule-schemas';

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
  categorySlug?: string;
  amount: string;
  currency: string;
  type: string;
  mccCode?: number | null;
  merchantName?: string | null;
  description?: string | null;
}

interface BudgetExceededPayload {
  budgetId: string;
  periodId: string;
  lineId: string;
  categoryId: string | null;
  spentPct: number;
  spentAmount: string;
  plannedAmount: string;
}

interface GoalAtRiskPayload {
  goalId: string;
  feasibilityScore: number;
  monthsAvailable: number;
}

/**
 * Worker that consumes the `rules` queue and dispatches matched events
 * to the RulesEngine. Per docs/06-BACKGROUND-JOBS.md §9 the events that
 * arrive here are routed by the OutboxPublisher.
 */
@Processor(QUEUE_NAMES.rules)
@Injectable()
export class RulesSaga extends WorkerHost {
  private readonly logger = new Logger(RulesSaga.name);

  constructor(private readonly engine: RulesEngine) {
    super();
  }

  async process(job: Job<OutboxEnvelope>): Promise<void> {
    const { eventType, payload, metadata, eventId } = job.data;

    const userId = (metadata?.userId as string | undefined) ?? this.extractUserId(eventType, payload);
    if (!userId) {
      this.logger.debug(`Skipping ${eventType}: no userId in metadata or payload`);
      return;
    }

    const ctx = this.buildContext(eventType, payload);
    if (!ctx) return;

    await this.engine.fire({
      userId,
      eventType,
      triggerEventId: eventId,
      ctx,
    });
  }

  private extractUserId(eventType: string, payload: unknown): string | undefined {
    if (payload && typeof payload === 'object' && 'userId' in payload) {
      const v = (payload as { userId?: unknown }).userId;
      if (typeof v === 'string') return v;
    }
    return undefined;
  }

  private buildContext(eventType: string, payload: unknown): EvaluationContext | null {
    const time = this.timeContext();

    switch (eventType) {
      case 'transaction.categorized': {
        const p = payload as TransactionCategorizedPayload;
        return {
          time,
          transaction: {
            amount: Number(p.amount),
            mccCode: p.mccCode ?? null,
            categorySlug: p.categorySlug ?? null,
            merchantName: p.merchantName ?? null,
            type: p.type,
            description: p.description ?? null,
          },
        };
      }
      case 'budget.line.exceeded.warning':
      case 'budget.line.exceeded.critical': {
        const p = payload as BudgetExceededPayload;
        return {
          time,
          budget: {
            spentPct: p.spentPct,
            spentAmount: Number(p.spentAmount),
          },
        };
      }
      case 'goal.at-risk': {
        const p = payload as GoalAtRiskPayload;
        return {
          time,
          goal: {
            feasibilityScore: p.feasibilityScore,
            progressPct: 0,
            priority: 3,
          },
        };
      }
      default:
        return { time };
    }
  }

  private timeContext(): EvaluationContext['time'] {
    const now = new Date();
    return { dayOfWeek: now.getDay(), hourOfDay: now.getHours() };
  }
}
