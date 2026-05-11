import { DomainEvent, DomainEventMetadata } from '../../../../../shared-kernel/events/domain-event';

interface MemoryWrittenPayload {
  recordId: string;
  userId: string;
  kind: string;
  importance: number;
}

export class MemoryWritten extends DomainEvent<MemoryWrittenPayload> {
  constructor(aggregateId: string, payload: MemoryWrittenPayload, metadata?: DomainEventMetadata) {
    super('MemoryRecord', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'memory.written';
  }
}

interface MemoryConsolidatedPayload {
  userId: string;
  semanticAdded: number;
  episodicCompressed: number;
  proceduralAdded: number;
}

export class MemoryConsolidated extends DomainEvent<MemoryConsolidatedPayload> {
  constructor(
    aggregateId: string,
    payload: MemoryConsolidatedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('MemoryRecord', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'memory.consolidated';
  }
}
