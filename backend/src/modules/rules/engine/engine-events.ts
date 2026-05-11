import { DomainEvent, DomainEventMetadata } from '../../../shared-kernel/events/domain-event';

/**
 * Cross-context "request" events emitted by the rules engine when a NOTIFY
 * or CREATE_RECOMMENDATION action fires. The Notifications and Recommendations
 * contexts subscribe to these and produce the actual side-effects.
 */

interface NotificationRequestedPayload {
  userId: string;
  ruleId: string;
  channel: 'in_app' | 'email' | 'push' | 'telegram';
  template: string;
  params: Record<string, unknown>;
}

export class RuleNotificationRequested extends DomainEvent<NotificationRequestedPayload> {
  constructor(
    aggregateId: string,
    payload: NotificationRequestedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Rule', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'rule.notification.requested';
  }
}

interface RecommendationRequestedPayload {
  userId: string;
  ruleId: string;
  kind: string;
  payload: Record<string, unknown>;
}

export class RuleRecommendationRequested extends DomainEvent<RecommendationRequestedPayload> {
  constructor(
    aggregateId: string,
    payload: RecommendationRequestedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Rule', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'rule.recommendation.requested';
  }
}
