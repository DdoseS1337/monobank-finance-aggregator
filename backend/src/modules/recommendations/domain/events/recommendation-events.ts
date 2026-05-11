import { DomainEvent, DomainEventMetadata } from '../../../../shared-kernel/events/domain-event';

interface RecommendationGeneratedPayload {
  recommendationId: string;
  userId: string;
  kind: string;
  generatedBy: string;
  rankingScore: number;
  validUntil: string | null;
}

export class RecommendationGenerated extends DomainEvent<RecommendationGeneratedPayload> {
  constructor(
    aggregateId: string,
    payload: RecommendationGeneratedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Recommendation', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'recommendation.generated';
  }
}

interface RecommendationDeliveredPayload {
  recommendationId: string;
  userId: string;
  channel: string;
}

export class RecommendationDelivered extends DomainEvent<RecommendationDeliveredPayload> {
  constructor(
    aggregateId: string,
    payload: RecommendationDeliveredPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Recommendation', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'recommendation.delivered';
  }
}

interface RecommendationFeedbackPayload {
  recommendationId: string;
  userId: string;
  decision: 'ACCEPTED' | 'REJECTED' | 'MODIFIED' | 'SNOOZED' | 'EXPIRED';
  decidedAt: string;
}

export class RecommendationAccepted extends DomainEvent<RecommendationFeedbackPayload> {
  constructor(
    aggregateId: string,
    payload: RecommendationFeedbackPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Recommendation', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'recommendation.accepted';
  }
}

export class RecommendationRejected extends DomainEvent<RecommendationFeedbackPayload> {
  constructor(
    aggregateId: string,
    payload: RecommendationFeedbackPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Recommendation', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'recommendation.rejected';
  }
}

export class RecommendationSnoozed extends DomainEvent<RecommendationFeedbackPayload> {
  constructor(
    aggregateId: string,
    payload: RecommendationFeedbackPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Recommendation', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'recommendation.snoozed';
  }
}
