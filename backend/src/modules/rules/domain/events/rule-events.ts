import { DomainEvent, DomainEventMetadata } from '../../../../shared-kernel/events/domain-event';

interface RuleTriggeredPayload {
  ruleId: string;
  triggerEventId: string | null;
  triggerEventType: string;
}

export class RuleTriggered extends DomainEvent<RuleTriggeredPayload> {
  constructor(aggregateId: string, payload: RuleTriggeredPayload, metadata?: DomainEventMetadata) {
    super('Rule', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'rule.triggered';
  }
}

interface RuleExecutedPayload {
  ruleId: string;
  executionId: string;
  actionsExecuted: number;
  durationMs: number;
}

export class RuleExecuted extends DomainEvent<RuleExecutedPayload> {
  constructor(aggregateId: string, payload: RuleExecutedPayload, metadata?: DomainEventMetadata) {
    super('Rule', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'rule.executed';
  }
}

interface RuleFailedPayload {
  ruleId: string;
  executionId: string;
  reason: string;
  failedAction: number | null;
}

export class RuleFailed extends DomainEvent<RuleFailedPayload> {
  constructor(aggregateId: string, payload: RuleFailedPayload, metadata?: DomainEventMetadata) {
    super('Rule', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'rule.failed';
  }
}

interface RuleConflictPayload {
  ruleId: string;
  conflictingRuleId: string;
  resourceType: string;
  resourceId: string;
}

export class RuleConflictDetected extends DomainEvent<RuleConflictPayload> {
  constructor(
    aggregateId: string,
    payload: RuleConflictPayload,
    metadata?: DomainEventMetadata,
  ) {
    super('Rule', aggregateId, payload, metadata);
  }
  get eventType(): string {
    return 'rule.conflict';
  }
}
