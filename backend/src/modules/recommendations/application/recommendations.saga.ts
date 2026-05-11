import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../../shared-kernel/queues/queue-names';
import { MemoryService } from '../../ai/memory/application/memory.service';
import { RecommendationPipeline } from './pipeline/pipeline.service';

interface OutboxEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

/**
 * Subscribes to the `recommendations` queue. Two responsibilities:
 *
 *   1. Trigger the pipeline on signals that indicate "user state likely
 *      changed" — budget overrun, deficit prediction, goal at risk,
 *      explicit rule.recommendation.requested.
 *
 *   2. Feed the AI memory: when a user accepts/rejects a recommendation,
 *      write an episodic record so the consolidation job can later
 *      promote stable preferences.
 */
@Processor(QUEUE_NAMES.recommendations)
@Injectable()
export class RecommendationsSaga extends WorkerHost {
  private readonly logger = new Logger(RecommendationsSaga.name);

  constructor(
    private readonly pipeline: RecommendationPipeline,
    private readonly memory: MemoryService,
  ) {
    super();
  }

  async process(job: Job<OutboxEnvelope>): Promise<void> {
    const { eventType, payload, metadata } = job.data;
    const userId = (metadata?.userId as string | undefined) ?? this.extractUserId(payload);
    if (!userId) return;

    switch (eventType) {
      case 'rule.recommendation.requested':
      case 'budget.line.exceeded.critical':
      case 'budget.line.exceeded.warning':
      case 'goal.at-risk':
      case 'cashflow.deficit.predicted':
      case 'cashflow.surplus.predicted':
      case 'cashflow.projection.updated':
      case 'subscription.unused':
        await this.pipeline.run(userId).catch((err) => {
          this.logger.error(
            `Pipeline run failed for user ${userId}: ${(err as Error).message}`,
          );
        });
        return;

      case 'recommendation.accepted':
        await this.recordFeedbackMemory(userId, payload, 'accepted');
        return;

      case 'recommendation.rejected':
      case 'recommendation.snoozed':
        await this.recordFeedbackMemory(userId, payload, eventType.split('.')[1]!);
        return;

      default:
        return;
    }
  }

  private async recordFeedbackMemory(
    userId: string,
    payload: unknown,
    decision: string,
  ): Promise<void> {
    const recId = (payload as { recommendationId?: string })?.recommendationId;
    if (!recId) return;
    try {
      await this.memory.writeEpisodic(
        userId,
        `User ${decision} recommendation ${recId}`,
        'recommendation_feedback',
        recId,
        decision === 'accepted' ? 0.6 : 0.5,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to write feedback memory: ${(error as Error).message}`,
      );
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
