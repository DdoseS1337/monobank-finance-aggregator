import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../../shared-kernel/queues/queue-names';
import { NotificationOrchestrator } from './notification-orchestrator.service';

interface OutboxEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

interface RecommendationGeneratedPayload {
  recommendationId: string;
  userId: string;
  kind: string;
  generatedBy: string;
  rankingScore: number;
}

interface RuleNotificationPayload {
  userId: string;
  ruleId: string;
  channel: 'in_app' | 'email' | 'push' | 'telegram';
  template: string;
  params: Record<string, unknown>;
}

interface BudgetExceededPayload {
  budgetId: string;
  lineId: string;
  spentPct: number;
  spentAmount: string;
  plannedAmount: string;
}

interface CashflowDeficitPayload {
  userId: string;
  predictedFor: string;
  estimatedAmount: string;
  confidence: number;
  daysAhead: number;
}

/**
 * Subscribes to the `notifications` queue. The OutboxPublisher routes a
 * handful of "user-visible" event types here; we map each to a dispatch().
 */
@Processor(QUEUE_NAMES.notifications)
@Injectable()
export class NotificationsSaga extends WorkerHost {
  private readonly logger = new Logger(NotificationsSaga.name);

  constructor(private readonly orchestrator: NotificationOrchestrator) {
    super();
  }

  async process(job: Job<OutboxEnvelope>): Promise<void> {
    const { eventType, payload, metadata } = job.data;
    const userId = (metadata?.userId as string | undefined) ?? this.extractUserId(payload);
    if (!userId) return;

    switch (eventType) {
      case 'recommendation.generated': {
        const p = payload as RecommendationGeneratedPayload;
        await this.orchestrator.dispatch({
          userId: p.userId,
          kind: 'recommendation.generated',
          severity: p.kind === 'CASHFLOW' ? 'CRITICAL' : 'INFO',
          payload: { recommendationId: p.recommendationId, kind: p.kind, score: p.rankingScore },
          dedupKey: `rec:${p.recommendationId}`,
          recommendationId: p.recommendationId,
        });
        return;
      }

      case 'rule.notification.requested': {
        const p = payload as RuleNotificationPayload;
        await this.orchestrator.dispatch({
          userId: p.userId,
          kind: `rule.${p.template}`,
          severity: 'INFO',
          payload: p.params,
          channels: [p.channel],
          dedupKey: `rule:${p.ruleId}:${p.template}`,
        });
        return;
      }

      case 'budget.line.exceeded.warning':
      case 'budget.line.exceeded.critical': {
        const p = payload as BudgetExceededPayload;
        await this.orchestrator.dispatch({
          userId,
          kind: eventType,
          severity: eventType.endsWith('critical') ? 'CRITICAL' : 'WARNING',
          payload: { ...p } as Record<string, unknown>,
          dedupKey: `budget-line:${p.lineId}:${eventType}`,
        });
        return;
      }

      case 'cashflow.deficit.predicted': {
        const p = payload as CashflowDeficitPayload;
        await this.orchestrator.dispatch({
          userId: p.userId,
          kind: 'cashflow.deficit',
          severity: 'CRITICAL',
          payload: { ...p } as Record<string, unknown>,
          dedupKey: `deficit:${p.predictedFor}`,
          bypassQuietHours: true, // critical financial alert overrides quiet hours
        });
        return;
      }

      case 'goal.at-risk':
      case 'goal.milestone.reached':
      case 'goal.contribution.made':
      case 'envelope.overdrawn':
      case 'transaction.flagged-as-anomaly': {
        await this.orchestrator.dispatch({
          userId,
          kind: eventType,
          severity: eventType === 'transaction.flagged-as-anomaly' ? 'WARNING' : 'INFO',
          payload: payload as Record<string, unknown>,
          dedupKey: `${eventType}:${(payload as { goalId?: string; envelopeId?: string }).goalId ?? (payload as { envelopeId?: string }).envelopeId ?? 'na'}`,
        });
        return;
      }

      default:
        return;
    }
  }

  private extractUserId(payload: unknown): string | undefined {
    if (payload && typeof payload === 'object' && 'userId' in payload) {
      const v = (payload as { userId?: unknown }).userId;
      if (typeof v === 'string') return v;
    }
    return undefined;
  }
}
