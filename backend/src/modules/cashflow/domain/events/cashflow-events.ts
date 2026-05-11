import { DomainEvent, DomainEventMetadata } from '../../../../shared-kernel/events/domain-event';

interface CashFlowProjectionUpdatedPayload {
  projectionId: string;
  userId: string;
  horizonDays: number;
  modelVersion: string;
  confidenceScore: number | null;
  generatedAt: string;
  pointsCount: number;
}

export class CashFlowProjectionUpdated extends DomainEvent<CashFlowProjectionUpdatedPayload> {
  constructor(
    aggregateId: string,
    payload: CashFlowProjectionUpdatedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('CashFlowProjection', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'cashflow.projection.updated';
  }
}

interface CashFlowDeficitPredictedPayload {
  userId: string;
  projectionId: string;
  predictedFor: string;
  estimatedAmount: string;
  confidence: number;
  daysAhead: number;
}

export class CashFlowDeficitPredicted extends DomainEvent<CashFlowDeficitPredictedPayload> {
  constructor(
    aggregateId: string,
    payload: CashFlowDeficitPredictedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('CashFlowProjection', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'cashflow.deficit.predicted';
  }
}

interface CashFlowSurplusPredictedPayload {
  userId: string;
  projectionId: string;
  predictedFor: string;
  estimatedAmount: string;
  confidence: number;
}

export class CashFlowSurplusPredicted extends DomainEvent<CashFlowSurplusPredictedPayload> {
  constructor(
    aggregateId: string,
    payload: CashFlowSurplusPredictedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('CashFlowProjection', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'cashflow.surplus.predicted';
  }
}

interface ScenarioSimulatedPayload {
  scenarioId: string;
  userId: string;
  baselineProjectionId: string;
}

export class ScenarioSimulated extends DomainEvent<ScenarioSimulatedPayload> {
  constructor(
    aggregateId: string,
    payload: ScenarioSimulatedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Scenario', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'cashflow.scenario.simulated';
  }
}
