import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { Recommendation, RecommendationKind, RecommendationStatus } from '../domain/recommendation.entity';
import {
  RECOMMENDATION_REPOSITORY,
  RecommendationRepository,
} from '../domain/repositories.interface';
import {
  RecommendationAccepted,
  RecommendationRejected,
  RecommendationSnoozed,
} from '../domain/events/recommendation-events';

@Injectable()
export class RecommendationsService {
  constructor(
    @Inject(RECOMMENDATION_REPOSITORY)
    private readonly repo: RecommendationRepository,
    private readonly events: DomainEventBus,
  ) {}

  async list(userId: string, opts: {
    status?: RecommendationStatus[];
    kinds?: RecommendationKind[];
    validOnly?: boolean;
    limit?: number;
  } = {}): Promise<Recommendation[]> {
    return this.repo.list({
      userId,
      status: opts.status,
      kinds: opts.kinds,
      validOnly: opts.validOnly,
      limit: opts.limit,
    });
  }

  async getOne(userId: string, id: string): Promise<Recommendation> {
    const rec = await this.repo.findById(id);
    if (!rec || rec.userId !== userId) {
      throw new NotFoundException(`Recommendation ${id} not found`);
    }
    return rec;
  }

  async accept(userId: string, id: string, feedbackText?: string): Promise<Recommendation> {
    const rec = await this.getOne(userId, id);
    rec.recordDecision('ACCEPTED');
    await this.repo.recordFeedback({
      recommendationId: id,
      userId,
      decision: 'ACCEPTED',
      feedbackText: feedbackText ?? null,
    });
    await this.events.publish(
      new RecommendationAccepted(
        rec.id,
        {
          recommendationId: rec.id,
          userId,
          decision: 'ACCEPTED',
          decidedAt: new Date().toISOString(),
        },
        { userId },
      ),
    );
    return rec;
  }

  async reject(userId: string, id: string, feedbackText?: string): Promise<Recommendation> {
    const rec = await this.getOne(userId, id);
    rec.recordDecision('REJECTED');
    await this.repo.recordFeedback({
      recommendationId: id,
      userId,
      decision: 'REJECTED',
      feedbackText: feedbackText ?? null,
    });
    await this.events.publish(
      new RecommendationRejected(
        rec.id,
        {
          recommendationId: rec.id,
          userId,
          decision: 'REJECTED',
          decidedAt: new Date().toISOString(),
        },
        { userId },
      ),
    );
    return rec;
  }

  async snooze(userId: string, id: string, untilHours = 24): Promise<Recommendation> {
    const rec = await this.getOne(userId, id);
    rec.recordDecision('SNOOZED');
    await this.repo.recordFeedback({
      recommendationId: id,
      userId,
      decision: 'SNOOZED',
      modifications: { snoozedHours: untilHours },
    });
    await this.events.publish(
      new RecommendationSnoozed(
        rec.id,
        {
          recommendationId: rec.id,
          userId,
          decision: 'SNOOZED',
          decidedAt: new Date().toISOString(),
        },
        { userId },
      ),
    );
    return rec;
  }

  async expireStale(): Promise<number> {
    return this.repo.expireStale();
  }
}
