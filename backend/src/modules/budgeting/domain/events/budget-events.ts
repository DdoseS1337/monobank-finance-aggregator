import { DomainEvent, DomainEventMetadata } from '../../../../shared-kernel/events/domain-event';

interface BudgetCreatedPayload {
  userId: string;
  name: string;
  method: string;
  cadence: string;
  baseCurrency: string;
}

export class BudgetCreated extends DomainEvent<BudgetCreatedPayload> {
  constructor(aggregateId: string, payload: BudgetCreatedPayload, metadata?: DomainEventMetadata) {
    super('Budget', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'budget.created';
  }
}

interface BudgetPeriodStartedPayload {
  budgetId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
}

export class BudgetPeriodStarted extends DomainEvent<BudgetPeriodStartedPayload> {
  constructor(
    aggregateId: string,
    payload: BudgetPeriodStartedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Budget', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'budget.period.started';
  }
}

interface BudgetPeriodClosedPayload {
  budgetId: string;
  periodId: string;
  closingBalance?: string;
}

export class BudgetPeriodClosed extends DomainEvent<BudgetPeriodClosedPayload> {
  constructor(
    aggregateId: string,
    payload: BudgetPeriodClosedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Budget', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'budget.period.closed';
  }
}

interface BudgetLineThresholdPayload {
  budgetId: string;
  periodId: string;
  lineId: string;
  categoryId: string | null;
  spentPct: number;
  spentAmount: string;
  plannedAmount: string;
}

export class BudgetLineExceededWarning extends DomainEvent<BudgetLineThresholdPayload> {
  constructor(
    aggregateId: string,
    payload: BudgetLineThresholdPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Budget', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'budget.line.exceeded.warning';
  }
}

export class BudgetLineExceededCritical extends DomainEvent<BudgetLineThresholdPayload> {
  constructor(
    aggregateId: string,
    payload: BudgetLineThresholdPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Budget', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'budget.line.exceeded.critical';
  }
}

interface EnvelopeRebalancedPayload {
  fromEnvelopeId: string;
  toEnvelopeId: string;
  amount: string;
  currency: string;
}

export class EnvelopeRebalanced extends DomainEvent<EnvelopeRebalancedPayload> {
  constructor(
    aggregateId: string,
    payload: EnvelopeRebalancedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Envelope', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'envelope.rebalanced';
  }
}

interface EnvelopeOverdrawnPayload {
  envelopeId: string;
  attemptedAmount: string;
  currentBalance: string;
}

export class EnvelopeOverdrawn extends DomainEvent<EnvelopeOverdrawnPayload> {
  constructor(
    aggregateId: string,
    payload: EnvelopeOverdrawnPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Envelope', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'envelope.overdrawn';
  }
}
