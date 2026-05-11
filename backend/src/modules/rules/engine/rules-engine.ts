import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { Rule } from '../domain/rule.entity';
import {
  RULE_EXECUTION_REPOSITORY,
  RULE_REPOSITORY,
  RuleExecutionRepository,
  RuleRepository,
} from '../domain/repositories.interface';
import { EvaluationContext } from '../domain/rule-schemas';
import { AstEvaluator } from './ast-evaluator';
import { ActionExecutionResult, ActionExecutor } from './action-executor';
import {
  RuleConflictDetected,
  RuleExecuted,
  RuleFailed,
  RuleTriggered,
} from '../domain/events/rule-events';

interface FireOptions {
  userId: string;
  eventType: string;
  triggerEventId?: string | null;
  ctx: EvaluationContext;
}

interface FireOutcome {
  matchedRules: number;
  firedRules: number;
  results: Array<{ ruleId: string; status: 'OK' | 'FAILED' | 'SKIPPED_COOLDOWN'; actions: ActionExecutionResult[] }>;
}

/**
 * Heart of the rules subsystem.
 *
 * Pipeline per incoming event:
 *   1. Fetch rules whose trigger matches eventType for this user.
 *   2. Sort by priority (asc → lower number = higher priority).
 *   3. For each rule:
 *        a. Skip if cooling down → log SKIPPED_COOLDOWN.
 *        b. Evaluate condition AST.
 *        c. If true → execute actions, persist execution log,
 *           emit rule.triggered + rule.executed/failed.
 *        d. Mark resources touched (target IDs) for conflict detection;
 *           if a later rule in the same fire targets the same resource,
 *           emit rule.conflict (does NOT block — the later rule still runs;
 *           recommendations layer handles UX).
 */
@Injectable()
export class RulesEngine {
  private readonly logger = new Logger(RulesEngine.name);

  constructor(
    @Inject(RULE_REPOSITORY) private readonly rules: RuleRepository,
    @Inject(RULE_EXECUTION_REPOSITORY) private readonly executions: RuleExecutionRepository,
    private readonly evaluator: AstEvaluator,
    private readonly executor: ActionExecutor,
    private readonly events: DomainEventBus,
  ) {}

  async fire(options: FireOptions): Promise<FireOutcome> {
    const candidates = await this.rules.findByEventTrigger(options.userId, options.eventType);
    const outcome: FireOutcome = {
      matchedRules: candidates.length,
      firedRules: 0,
      results: [],
    };
    if (candidates.length === 0) return outcome;

    const touchedResources = new Map<string, string>(); // resourceKey → firstRuleId

    for (const rule of candidates) {
      if (rule.isCoolingDown()) {
        await this.logExecution(rule, options, false, [], 'SKIPPED_COOLDOWN', null, 0);
        outcome.results.push({ ruleId: rule.id, status: 'SKIPPED_COOLDOWN', actions: [] });
        continue;
      }

      const conditionMatches = rule.condition
        ? this.evaluator.evaluate(rule.condition, options.ctx)
        : true;

      if (!conditionMatches) {
        await this.logExecution(rule, options, false, [], 'OK', null, 0);
        continue;
      }

      // Conflict detection: collect targets BEFORE executing.
      const conflicts = this.detectConflicts(rule, touchedResources);
      for (const c of conflicts) {
        await this.events.publish(
          new RuleConflictDetected(rule.id, {
            ruleId: rule.id,
            conflictingRuleId: c.firstRuleId,
            resourceType: c.resourceType,
            resourceId: c.resourceId,
          }, { userId: options.userId }),
        );
      }

      const start = Date.now();
      let actionResults: ActionExecutionResult[] = [];
      try {
        await this.events.publish(
          new RuleTriggered(rule.id, {
            ruleId: rule.id,
            triggerEventId: options.triggerEventId ?? null,
            triggerEventType: options.eventType,
          }, { userId: options.userId }),
        );

        actionResults = await this.executor.executeAll(
          rule.id,
          options.userId,
          rule.actions,
          options.ctx,
        );
        const durationMs = Date.now() - start;
        const anyFailed = actionResults.some((r) => r.status === 'FAILED');

        const executionId = randomUUID();
        await this.executions.log({
          id: executionId,
          ruleId: rule.id,
          triggeredAt: new Date(),
          triggerEvent: { eventType: options.eventType, eventId: options.triggerEventId ?? null },
          evaluationResult: true,
          actionsExecuted: actionResults,
          status: anyFailed ? 'FAILED' : 'OK',
          error: anyFailed
            ? actionResults
                .filter((r) => r.status === 'FAILED')
                .map((r) => `${r.type}: ${r.error}`)
                .join('; ')
            : null,
          durationMs,
        });

        if (anyFailed) {
          const firstFailed = actionResults.find((r) => r.status === 'FAILED');
          await this.events.publish(
            new RuleFailed(rule.id, {
              ruleId: rule.id,
              executionId,
              reason: firstFailed?.error ?? 'unknown',
              failedAction: firstFailed?.index ?? null,
            }, { userId: options.userId }),
          );
        } else {
          await this.events.publish(
            new RuleExecuted(rule.id, {
              ruleId: rule.id,
              executionId,
              actionsExecuted: actionResults.length,
              durationMs,
            }, { userId: options.userId }),
          );
        }

        rule.recordExecution();
        await this.rules.save(rule);

        // Mark resources as touched.
        this.markResources(rule, touchedResources);

        outcome.firedRules += 1;
        outcome.results.push({
          ruleId: rule.id,
          status: anyFailed ? 'FAILED' : 'OK',
          actions: actionResults,
        });
      } catch (error) {
        this.logger.error(`Rule ${rule.id} crashed`, error as Error);
        const durationMs = Date.now() - start;
        await this.logExecution(
          rule,
          options,
          true,
          actionResults,
          'FAILED',
          (error as Error).message,
          durationMs,
        );
        outcome.results.push({ ruleId: rule.id, status: 'FAILED', actions: actionResults });
      }
    }

    return outcome;
  }

  private detectConflicts(
    rule: Rule,
    touched: Map<string, string>,
  ): Array<{ firstRuleId: string; resourceType: string; resourceId: string }> {
    const conflicts: Array<{ firstRuleId: string; resourceType: string; resourceId: string }> = [];
    for (const action of rule.actions) {
      if (action.type === 'ALLOCATE_PERCENT' || action.type === 'ALLOCATE_FIXED') {
        const key = this.resourceKey(action.target);
        if (key && touched.has(key)) {
          const firstRuleId = touched.get(key)!;
          if (firstRuleId !== rule.id) {
            conflicts.push({
              firstRuleId,
              resourceType: action.target.kind,
              resourceId: this.resourceId(action.target),
            });
          }
        }
      }
    }
    return conflicts;
  }

  private markResources(rule: Rule, touched: Map<string, string>): void {
    for (const action of rule.actions) {
      if (action.type === 'ALLOCATE_PERCENT' || action.type === 'ALLOCATE_FIXED') {
        const key = this.resourceKey(action.target);
        if (key && !touched.has(key)) touched.set(key, rule.id);
      }
    }
  }

  private resourceKey(target: { kind: string }): string | null {
    if ('goalId' in target) return `GOAL:${(target as { goalId: string }).goalId}`;
    if ('envelopeId' in target) return `ENVELOPE:${(target as { envelopeId: string }).envelopeId}`;
    return null;
  }

  private resourceId(target: { kind: string }): string {
    if ('goalId' in target) return (target as { goalId: string }).goalId;
    if ('envelopeId' in target) return (target as { envelopeId: string }).envelopeId;
    return 'unknown';
  }

  private async logExecution(
    rule: Rule,
    options: FireOptions,
    evaluationResult: boolean,
    actionResults: ActionExecutionResult[],
    status: 'OK' | 'FAILED' | 'SKIPPED_COOLDOWN',
    error: string | null,
    durationMs: number,
  ): Promise<void> {
    await this.executions.log({
      id: randomUUID(),
      ruleId: rule.id,
      triggeredAt: new Date(),
      triggerEvent: {
        eventType: options.eventType,
        eventId: options.triggerEventId ?? null,
      },
      evaluationResult,
      actionsExecuted: actionResults,
      status,
      error,
      durationMs,
    });
  }
}
