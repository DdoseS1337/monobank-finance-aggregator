import { randomUUID } from 'crypto';
import {
  ActionSpec,
  ConditionASTNode,
  TriggerSpec,
} from './rule-schemas';

export interface RuleProps {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  trigger: TriggerSpec;
  condition: ConditionASTNode | null;
  actions: ActionSpec[];
  priority: number;
  cooldownSeconds: number;
  enabled: boolean;
  lastExecutedAt: Date | null;
  executionCount: number;
  createdAt: Date;
}

export class Rule {
  private constructor(private props: RuleProps) {}

  static rehydrate(props: RuleProps): Rule {
    return new Rule(props);
  }

  static create(input: {
    userId: string;
    name: string;
    description?: string;
    trigger: TriggerSpec;
    condition?: ConditionASTNode | null;
    actions: ActionSpec[];
    priority?: number;
    cooldownSeconds?: number;
    enabled?: boolean;
  }): Rule {
    if (!input.name.trim()) throw new Error('Rule name required');
    if (!input.actions || input.actions.length === 0) {
      throw new Error('Rule must have at least one action');
    }
    if (input.priority !== undefined && (input.priority < 1 || input.priority > 1000)) {
      throw new Error('Priority must be between 1 and 1000');
    }
    return new Rule({
      id: randomUUID(),
      userId: input.userId,
      name: input.name.trim(),
      description: input.description ?? null,
      trigger: input.trigger,
      condition: input.condition ?? null,
      actions: input.actions,
      priority: input.priority ?? 100,
      cooldownSeconds: input.cooldownSeconds ?? 0,
      enabled: input.enabled ?? true,
      lastExecutedAt: null,
      executionCount: 0,
      createdAt: new Date(),
    });
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get trigger(): TriggerSpec {
    return this.props.trigger;
  }
  get condition(): ConditionASTNode | null {
    return this.props.condition;
  }
  get actions(): ActionSpec[] {
    return [...this.props.actions];
  }
  get priority(): number {
    return this.props.priority;
  }
  get cooldownSeconds(): number {
    return this.props.cooldownSeconds;
  }
  get enabled(): boolean {
    return this.props.enabled;
  }
  get lastExecutedAt(): Date | null {
    return this.props.lastExecutedAt;
  }
  get executionCount(): number {
    return this.props.executionCount;
  }

  // Queries
  matchesTriggerEvent(eventType: string): boolean {
    return this.props.trigger.kind === 'EVENT' && this.props.trigger.eventType === eventType;
  }

  isCoolingDown(at: Date = new Date()): boolean {
    if (this.props.cooldownSeconds <= 0) return false;
    if (!this.props.lastExecutedAt) return false;
    const elapsedMs = at.getTime() - this.props.lastExecutedAt.getTime();
    return elapsedMs < this.props.cooldownSeconds * 1000;
  }

  // Commands
  enable(): void {
    this.props.enabled = true;
  }

  disable(): void {
    this.props.enabled = false;
  }

  rename(name: string, description?: string | null): void {
    if (!name.trim()) throw new Error('Name required');
    this.props.name = name.trim();
    if (description !== undefined) this.props.description = description;
  }

  setPriority(priority: number): void {
    if (priority < 1 || priority > 1000) {
      throw new Error('Priority must be between 1 and 1000');
    }
    this.props.priority = priority;
  }

  setCooldown(seconds: number): void {
    if (seconds < 0 || seconds > 86_400 * 30) {
      throw new Error('Cooldown must be between 0 and 30 days');
    }
    this.props.cooldownSeconds = seconds;
  }

  replaceCondition(condition: ConditionASTNode | null): void {
    this.props.condition = condition;
  }

  replaceActions(actions: ActionSpec[]): void {
    if (actions.length === 0) {
      throw new Error('Rule must have at least one action');
    }
    this.props.actions = actions;
  }

  recordExecution(at: Date = new Date()): void {
    this.props.lastExecutedAt = at;
    this.props.executionCount += 1;
  }

  toSnapshot(): RuleProps {
    return {
      ...this.props,
      actions: [...this.props.actions],
    };
  }
}
