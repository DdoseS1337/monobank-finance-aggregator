import { randomUUID } from 'crypto';

export interface DomainEventMetadata {
  correlationId?: string;
  causationId?: string;
  userId?: string;
  source?: string;
  [key: string]: unknown;
}

export abstract class DomainEvent<TPayload = unknown> {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventVersion: number = 1;
  public readonly metadata: DomainEventMetadata;

  constructor(
    public readonly aggregateType: string,
    public readonly aggregateId: string,
    public readonly payload: TPayload,
    metadata: DomainEventMetadata = {},
  ) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.metadata = { ...metadata };
  }

  abstract get eventType(): string;

  toJSON() {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      eventVersion: this.eventVersion,
      aggregateType: this.aggregateType,
      aggregateId: this.aggregateId,
      payload: this.payload,
      metadata: this.metadata,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}
