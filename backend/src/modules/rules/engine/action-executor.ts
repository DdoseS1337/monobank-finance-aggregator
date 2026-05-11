import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Currency, Money } from '../../../shared-kernel/money/money';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { GoalsService } from '../../goals/application/goals.service';
import { ActionSpec, EvaluationContext } from '../domain/rule-schemas';
import { RuleNotificationRequested, RuleRecommendationRequested } from './engine-events';

export interface ActionExecutionResult {
  index: number;
  type: ActionSpec['type'];
  status: 'OK' | 'FAILED' | 'SKIPPED';
  detail: Record<string, unknown>;
  error?: string;
}

/**
 * Executes a list of ActionSpec entries on behalf of a fired Rule.
 *
 * - Each action type maps to ONE concrete capability:
 *     ALLOCATE_PERCENT     → GoalsService.contribute (only GOAL targets in v1)
 *     ALLOCATE_FIXED       → GoalsService.contribute / Envelope (TODO)
 *     TRANSFER             → Envelope-to-envelope (TODO Phase 2.4)
 *     NOTIFY               → emits RuleNotificationRequested (Notifications context picks it up)
 *     CREATE_RECOMMENDATION→ emits RuleRecommendationRequested (Recommendations context)
 * - We never throw out of executeAll(); per-action failures are reported in
 *   the result list so the rule engine can log a partial success.
 *
 * NOTE: ENVELOPE/BUDGET_LINE allocations and TRANSFER are stubbed for v1
 * (returns SKIPPED). The Budgeting module already supports envelope ops at the
 * domain level — wiring through here lands in Phase 2.4 (Automation polish).
 */
@Injectable()
export class ActionExecutor {
  private readonly logger = new Logger(ActionExecutor.name);

  constructor(
    private readonly goals: GoalsService,
    private readonly events: DomainEventBus,
  ) {}

  async executeAll(
    ruleId: string,
    userId: string,
    actions: ActionSpec[],
    ctx: EvaluationContext,
  ): Promise<ActionExecutionResult[]> {
    const results: ActionExecutionResult[] = [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]!;
      try {
        results.push(await this.executeOne(ruleId, userId, i, action, ctx));
      } catch (error) {
        this.logger.warn(
          `Rule ${ruleId} action[${i}] (${action.type}) failed: ${(error as Error).message}`,
        );
        results.push({
          index: i,
          type: action.type,
          status: 'FAILED',
          detail: {},
          error: (error as Error).message,
        });
      }
    }
    return results;
  }

  private async executeOne(
    ruleId: string,
    userId: string,
    index: number,
    action: ActionSpec,
    ctx: EvaluationContext,
  ): Promise<ActionExecutionResult> {
    switch (action.type) {
      case 'ALLOCATE_PERCENT': {
        if (action.target.kind !== 'GOAL') {
          return this.skipped(index, action.type, 'Only GOAL target supported in v1');
        }
        const sourceAmount = ctx.transaction?.amount;
        if (sourceAmount === undefined) {
          return this.skipped(index, action.type, 'No transaction in context');
        }
        const cut = new Decimal(sourceAmount).abs().mul(action.percent).div(100);
        const goal = await this.goals.contribute(userId, {
          goalId: action.target.goalId,
          amount: cut.toFixed(2),
          sourceType: 'RULE',
          sourceRef: ruleId,
        });
        return {
          index,
          type: action.type,
          status: 'OK',
          detail: { goalId: goal.id, amount: cut.toFixed(2), percent: action.percent },
        };
      }

      case 'ALLOCATE_FIXED': {
        if (action.target.kind !== 'GOAL') {
          return this.skipped(index, action.type, 'Envelope target not implemented yet');
        }
        const goal = await this.goals.contribute(userId, {
          goalId: action.target.goalId,
          amount: action.amount,
          sourceType: 'RULE',
          sourceRef: ruleId,
        });
        return {
          index,
          type: action.type,
          status: 'OK',
          detail: { goalId: goal.id, amount: action.amount, currency: action.currency },
        };
      }

      case 'TRANSFER': {
        // Phase 2.4: full envelope transfer wiring
        return this.skipped(index, action.type, 'Envelope transfers land in Phase 2.4');
      }

      case 'NOTIFY': {
        await this.events.publish(
          new RuleNotificationRequested(ruleId, {
            userId,
            ruleId,
            channel: action.channel,
            template: action.template,
            params: action.params ?? {},
          }),
        );
        return {
          index,
          type: action.type,
          status: 'OK',
          detail: { channel: action.channel, template: action.template },
        };
      }

      case 'CREATE_RECOMMENDATION': {
        await this.events.publish(
          new RuleRecommendationRequested(ruleId, {
            userId,
            ruleId,
            kind: action.kind,
            payload: action.payload,
          }),
        );
        return {
          index,
          type: action.type,
          status: 'OK',
          detail: { kind: action.kind },
        };
      }
    }
  }

  private skipped(index: number, type: ActionSpec['type'], reason: string): ActionExecutionResult {
    return { index, type, status: 'SKIPPED', detail: { reason } };
  }

  // helper to satisfy TS exhaustiveness should we ever add new ActionSpec types
  // and forget to handle them in switch above
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _exhaust(_money: Money, _currency: Currency): never {
    throw new Error('Unreachable');
  }
}
