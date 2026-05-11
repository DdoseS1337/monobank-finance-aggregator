import { Rule } from './rule.entity';

export const RULE_REPOSITORY = Symbol('RuleRepository');
export const RULE_EXECUTION_REPOSITORY = Symbol('RuleExecutionRepository');

export interface RuleRepository {
  save(rule: Rule): Promise<void>;
  findById(id: string): Promise<Rule | null>;
  findByUser(userId: string): Promise<Rule[]>;
  findByEventTrigger(userId: string, eventType: string): Promise<Rule[]>;
  delete(id: string): Promise<void>;
}

export interface RuleExecutionLogEntry {
  id: string;
  ruleId: string;
  triggeredAt: Date;
  triggerEvent: unknown;
  evaluationResult: boolean;
  actionsExecuted: unknown;
  status: 'OK' | 'FAILED' | 'SKIPPED_COOLDOWN';
  error: string | null;
  durationMs: number | null;
}

export interface RuleExecutionRepository {
  log(entry: RuleExecutionLogEntry): Promise<void>;
  findRecent(ruleId: string, limit: number): Promise<RuleExecutionLogEntry[]>;
}
