import { DomainEvent, DomainEventMetadata } from '../../../../shared-kernel/events/domain-event';

interface GoalCreatedPayload {
  userId: string;
  type: string;
  name: string;
  targetAmount: string;
  baseCurrency: string;
  deadline: string | null;
}

export class GoalCreated extends DomainEvent<GoalCreatedPayload> {
  constructor(aggregateId: string, payload: GoalCreatedPayload, metadata?: DomainEventMetadata) {
    super('Goal', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'goal.created';
  }
}

interface GoalContributionMadePayload {
  goalId: string;
  amount: string;
  sourceType: string;
  sourceRef: string | null;
  newCurrentAmount: string;
}

export class GoalContributionMade extends DomainEvent<GoalContributionMadePayload> {
  constructor(
    aggregateId: string,
    payload: GoalContributionMadePayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Goal', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'goal.contribution.made';
  }
}

interface GoalMilestonePayload {
  goalId: string;
  thresholdPct: number;
  reachedAt: string;
}

export class GoalMilestoneReached extends DomainEvent<GoalMilestonePayload> {
  constructor(
    aggregateId: string,
    payload: GoalMilestonePayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Goal', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'goal.milestone.reached';
  }
}

interface GoalAtRiskPayload {
  goalId: string;
  feasibilityScore: number;
  monthsAvailable: number;
  monthsRequired: number | null;
}

export class GoalAtRisk extends DomainEvent<GoalAtRiskPayload> {
  constructor(aggregateId: string, payload: GoalAtRiskPayload, metadata?: DomainEventMetadata) {
    super('Goal', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'goal.at-risk';
  }
}

interface GoalCompletedPayload {
  goalId: string;
  finalAmount: string;
  completedAt: string;
}

export class GoalCompleted extends DomainEvent<GoalCompletedPayload> {
  constructor(
    aggregateId: string,
    payload: GoalCompletedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Goal', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'goal.completed';
  }
}

interface GoalDeadlineMissedPayload {
  goalId: string;
  deadline: string;
  shortfallAmount: string;
}

export class GoalDeadlineMissed extends DomainEvent<GoalDeadlineMissedPayload> {
  constructor(
    aggregateId: string,
    payload: GoalDeadlineMissedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Goal', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'goal.deadline.missed';
  }
}

interface GoalAbandonedPayload {
  goalId: string;
  reason: string | null;
  abandonedAt: string;
}

export class GoalAbandoned extends DomainEvent<GoalAbandonedPayload> {
  constructor(
    aggregateId: string,
    payload: GoalAbandonedPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Goal', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'goal.abandoned';
  }
}
