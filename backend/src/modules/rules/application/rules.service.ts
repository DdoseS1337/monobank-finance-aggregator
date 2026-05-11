import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Rule } from '../domain/rule.entity';
import {
  RULE_REPOSITORY,
  RuleRepository,
} from '../domain/repositories.interface';
import {
  ActionsArraySchema,
  ActionSpec,
  ConditionASTNode,
  ConditionASTSchema,
  EvaluationContext,
  TriggerSpec,
  TriggerSpecSchema,
} from '../domain/rule-schemas';
import { AstEvaluator } from '../engine/ast-evaluator';

export interface CreateRuleInput {
  userId: string;
  name: string;
  description?: string;
  trigger: TriggerSpec;
  condition?: ConditionASTNode | null;
  actions: ActionSpec[];
  priority?: number;
  cooldownSeconds?: number;
  enabled?: boolean;
}

export interface UpdateRuleInput {
  name?: string;
  description?: string | null;
  condition?: ConditionASTNode | null;
  actions?: ActionSpec[];
  priority?: number;
  cooldownSeconds?: number;
  enabled?: boolean;
}

@Injectable()
export class RulesService {
  constructor(
    @Inject(RULE_REPOSITORY) private readonly rules: RuleRepository,
    private readonly evaluator: AstEvaluator,
  ) {}

  async createRule(input: CreateRuleInput): Promise<Rule> {
    // Defense in depth: even if HTTP DTO already validated, we re-parse here
    // because rules can also be created from internal callers (templates, AI).
    TriggerSpecSchema.parse(input.trigger);
    if (input.condition) ConditionASTSchema.parse(input.condition);
    ActionsArraySchema.parse(input.actions);

    const rule = Rule.create({
      userId: input.userId,
      name: input.name,
      description: input.description,
      trigger: input.trigger,
      condition: input.condition ?? null,
      actions: input.actions,
      priority: input.priority,
      cooldownSeconds: input.cooldownSeconds,
      enabled: input.enabled,
    });
    await this.rules.save(rule);
    return rule;
  }

  async listRules(userId: string): Promise<Rule[]> {
    return this.rules.findByUser(userId);
  }

  async getRule(userId: string, ruleId: string): Promise<Rule> {
    return this.requireRule(userId, ruleId);
  }

  async updateRule(
    userId: string,
    ruleId: string,
    input: UpdateRuleInput,
  ): Promise<Rule> {
    const rule = await this.requireRule(userId, ruleId);

    if (input.name !== undefined || input.description !== undefined) {
      rule.rename(input.name ?? rule.name, input.description ?? rule.description);
    }
    if (input.condition !== undefined) {
      if (input.condition) ConditionASTSchema.parse(input.condition);
      rule.replaceCondition(input.condition);
    }
    if (input.actions !== undefined) {
      ActionsArraySchema.parse(input.actions);
      rule.replaceActions(input.actions);
    }
    if (input.priority !== undefined) rule.setPriority(input.priority);
    if (input.cooldownSeconds !== undefined) rule.setCooldown(input.cooldownSeconds);
    if (input.enabled !== undefined) {
      input.enabled ? rule.enable() : rule.disable();
    }

    await this.rules.save(rule);
    return rule;
  }

  async enable(userId: string, ruleId: string): Promise<Rule> {
    const rule = await this.requireRule(userId, ruleId);
    rule.enable();
    await this.rules.save(rule);
    return rule;
  }

  async disable(userId: string, ruleId: string): Promise<Rule> {
    const rule = await this.requireRule(userId, ruleId);
    rule.disable();
    await this.rules.save(rule);
    return rule;
  }

  async delete(userId: string, ruleId: string): Promise<void> {
    const rule = await this.requireRule(userId, ruleId);
    await this.rules.delete(rule.id);
  }

  /**
   * Dry-run evaluates a rule's condition against a synthetic context
   * WITHOUT executing actions. Used by the UI rule builder to preview
   * whether a rule would fire on a given example event.
   */
  async dryRun(
    userId: string,
    ruleId: string,
    ctx: EvaluationContext,
  ): Promise<{ wouldFire: boolean; isCoolingDown: boolean; actions: ActionSpec[] }> {
    const rule = await this.requireRule(userId, ruleId);
    const wouldFire = rule.condition
      ? this.evaluator.evaluate(rule.condition, ctx)
      : true;
    return {
      wouldFire,
      isCoolingDown: rule.isCoolingDown(),
      actions: rule.actions,
    };
  }

  private async requireRule(userId: string, ruleId: string): Promise<Rule> {
    const rule = await this.rules.findById(ruleId);
    if (!rule || rule.userId !== userId) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }
    return rule;
  }
}
