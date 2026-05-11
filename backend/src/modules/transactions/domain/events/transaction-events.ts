import { DomainEvent, DomainEventMetadata } from '../../../../shared-kernel/events/domain-event';

interface TransactionImportedPayload {
  transactionId: string;
  userId: string;
  accountId: string;
  amount: string;
  currency: string;
  type: string;
  mccCode: number | null;
  merchantName: string | null;
  description: string | null;
}

export class TransactionImported extends DomainEvent<TransactionImportedPayload> {
  constructor(
    aggregateId: string,
    payload: TransactionImportedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Transaction', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'transaction.imported';
  }
}

interface TransactionRecategorizedPayload {
  transactionId: string;
  userId: string;
  oldCategoryId: string | null;
  newCategoryId: string;
  source: 'USER' | 'AUTO';
}

export class TransactionRecategorized extends DomainEvent<TransactionRecategorizedPayload> {
  constructor(
    aggregateId: string,
    payload: TransactionRecategorizedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Transaction', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'transaction.recategorized';
  }
}

interface TransactionFlaggedAnomalyPayload {
  transactionId: string;
  userId: string;
  anomalyScore: number;
  reason: string;
}

export class TransactionFlaggedAsAnomaly extends DomainEvent<TransactionFlaggedAnomalyPayload> {
  constructor(
    aggregateId: string,
    payload: TransactionFlaggedAnomalyPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Transaction', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'transaction.flagged-as-anomaly';
  }
}
