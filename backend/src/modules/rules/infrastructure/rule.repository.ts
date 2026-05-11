import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { Rule } from '../domain/rule.entity';
import {
  RuleExecutionLogEntry,
  RuleExecutionRepository,
  RuleRepository,
} from '../domain/repositories.interface';
import {
  ActionSpec,
  ConditionASTNode,
  TriggerSpec,
} from '../domain/rule-schemas';

@Injectable()
export class PrismaRuleRepository implements RuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(rule: Rule): Promise<void> {
    const s = rule.toSnapshot();
    await this.prisma.rule.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        userId: s.userId,
        name: s.name,
        description: s.description,
        triggerSpec: s.trigger as unknown as Prisma.InputJsonValue,
        conditionAst: (s.condition ?? null) as unknown as Prisma.InputJsonValue,
        actions: s.actions as unknown as Prisma.InputJsonValue,
        priority: s.priority,
        cooldownSeconds: s.cooldownSeconds,
        enabled: s.enabled,
        lastExecutedAt: s.lastExecutedAt,
        executionCount: s.executionCount,
      },
      update: {
        name: s.name,
        description: s.description,
        triggerSpec: s.trigger as unknown as Prisma.InputJsonValue,
        conditionAst: (s.condition ?? null) as unknown as Prisma.InputJsonValue,
        actions: s.actions as unknown as Prisma.InputJsonValue,
        priority: s.priority,
        cooldownSeconds: s.cooldownSeconds,
        enabled: s.enabled,
        lastExecutedAt: s.lastExecutedAt,
        executionCount: s.executionCount,
      },
    });
  }

  async findById(id: string): Promise<Rule | null> {
    const row = await this.prisma.rule.findUnique({ where: { id } });
    return row ? this.toAggregate(row) : null;
  }

  async findByUser(userId: string): Promise<Rule[]> {
    const rows = await this.prisma.rule.findMany({
      where: { userId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async findByEventTrigger(userId: string, eventType: string): Promise<Rule[]> {
    // Postgres JSON path query: trigger_spec->>'kind' = 'EVENT'
    //                       AND trigger_spec->>'eventType' = ?
    const rows = await this.prisma.rule.findMany({
      where: {
        userId,
        enabled: true,
        AND: [
          { triggerSpec: { path: ['kind'], equals: 'EVENT' } },
          { triggerSpec: { path: ['eventType'], equals: eventType } },
        ],
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.rule.delete({ where: { id } });
  }

  private toAggregate(row: {
    id: string;
    userId: string;
    name: string;
    description: string | null;
    triggerSpec: unknown;
    conditionAst: unknown;
    actions: unknown;
    priority: number;
    cooldownSeconds: number;
    enabled: boolean;
    lastExecutedAt: Date | null;
    executionCount: number;
    createdAt: Date;
  }): Rule {
    return Rule.rehydrate({
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      trigger: row.triggerSpec as TriggerSpec,
      condition: (row.conditionAst as ConditionASTNode | null) ?? null,
      actions: row.actions as ActionSpec[],
      priority: row.priority,
      cooldownSeconds: row.cooldownSeconds,
      enabled: row.enabled,
      lastExecutedAt: row.lastExecutedAt,
      executionCount: row.executionCount,
      createdAt: row.createdAt,
    });
  }
}

@Injectable()
export class PrismaRuleExecutionRepository implements RuleExecutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: RuleExecutionLogEntry): Promise<void> {
    await this.prisma.ruleExecution.create({
      data: {
        id: entry.id,
        ruleId: entry.ruleId,
        triggeredAt: entry.triggeredAt,
        triggerEvent: entry.triggerEvent as Prisma.InputJsonValue,
        evaluationResult: entry.evaluationResult,
        actionsExecuted: entry.actionsExecuted as Prisma.InputJsonValue,
        status: entry.status,
        error: entry.error,
        durationMs: entry.durationMs,
      },
    });
  }

  async findRecent(ruleId: string, limit: number): Promise<RuleExecutionLogEntry[]> {
    const rows = await this.prisma.ruleExecution.findMany({
      where: { ruleId },
      orderBy: { triggeredAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      ruleId: r.ruleId,
      triggeredAt: r.triggeredAt,
      triggerEvent: r.triggerEvent,
      evaluationResult: r.evaluationResult,
      actionsExecuted: r.actionsExecuted,
      status: r.status as 'OK' | 'FAILED' | 'SKIPPED_COOLDOWN',
      error: r.error,
      durationMs: r.durationMs,
    }));
  }
}
