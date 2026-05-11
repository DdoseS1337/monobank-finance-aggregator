import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Currency } from '../../../../shared-kernel/money/money';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';
import { GoalsService } from '../../../goals/application/goals.service';
import { BudgetingService } from '../../../budgeting/application/budgeting.service';
import { RecommendationsService } from '../../../recommendations/application/recommendations.service';
import { StagedActionsService } from '../../orchestration/staged-actions.service';
import { CategoryResolverService } from '../category-resolver.service';
import { ToolDefinition, ToolResult } from '../tool.interface';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every mutation tool implements two-step confirmation:
 *
 *   1. Tool executes with `intent='preview'` (default) → stages a row,
 *      returns CONFIRMATION_REQUIRED with stagedActionId.
 *   2. The user (via UI) calls POST /staged-actions/:id/confirm.
 *      The corresponding *_confirm tool actually performs the change.
 *
 * The chat surface receives the stagedActionId in the tool result and is
 * expected to surface it as a button/chip in the conversation UI.
 */

// ────────────────────────── Create Goal ──────────────────────────

const CreateGoalInput = z.object({
  type: z.enum(['SAVING', 'DEBT_PAYOFF', 'INVESTMENT', 'PURCHASE']),
  name: z.string().min(1).max(255),
  targetAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  baseCurrency: z.enum(['UAH', 'USD', 'EUR', 'GBP', 'PLN']),
  deadline: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  description: z.string().max(1000).optional(),
});
type CreateGoalInput = z.infer<typeof CreateGoalInput>;

@Injectable()
export class CreateGoalTool implements ToolDefinition<CreateGoalInput, unknown> {
  readonly name = 'create_goal';
  readonly category = 'MUTATION' as const;
  readonly description =
    'Stages creation of a financial goal. Returns a stagedActionId; the user must confirm before the goal is created.';
  readonly inputSchema = CreateGoalInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: true };
  readonly sideEffects = {
    writes: ['Goal'],
    emitsEvents: ['goal.created'],
    estimatedCost: 'MEDIUM' as const,
  };

  constructor(private readonly staged: StagedActionsService) {}

  async execute(input: CreateGoalInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    const action = await this.staged.stage({
      userId: ctx.userId,
      actionType: 'goal.create',
      payload: input as Record<string, unknown>,
      preview: {
        action: 'Створити фінансову ціль',
        name: input.name,
        type: input.type,
        targetAmount: input.targetAmount,
        currency: input.baseCurrency,
        deadline: input.deadline ?? 'не вказано',
        priority: input.priority ?? 3,
      },
      initiatedBy: 'agent',
    });
    return {
      ok: false,
      retryable: false,
      error: {
        kind: 'CONFIRMATION_REQUIRED',
        stagedActionId: action.id,
        preview: action.preview,
      },
    };
  }
}

// ────────────────────────── Contribute to goal ──────────────────────────

const ContributeInput = z.object({
  goalId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  note: z.string().max(500).optional(),
});
type ContributeInput = z.infer<typeof ContributeInput>;

@Injectable()
export class ContributeToGoalTool implements ToolDefinition<ContributeInput, unknown> {
  readonly name = 'contribute_to_goal';
  readonly category = 'MUTATION' as const;
  readonly description = 'Stages a contribution to an existing goal; user must confirm.';
  readonly inputSchema = ContributeInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: true };
  readonly sideEffects = {
    writes: ['Goal', 'GoalContribution'],
    emitsEvents: ['goal.contribution.made'],
    estimatedCost: 'LOW' as const,
  };

  constructor(
    private readonly goals: GoalsService,
    private readonly staged: StagedActionsService,
  ) {}

  async execute(input: ContributeInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    try {
      const goal = await this.goals.getGoal(ctx.userId, input.goalId);
      const action = await this.staged.stage({
        userId: ctx.userId,
        actionType: 'goal.contribute',
        payload: input as Record<string, unknown>,
        preview: {
          action: 'Поповнити ціль',
          goalName: goal.name,
          amount: input.amount,
          currency: goal.currency,
          newProjectedTotal: (
            Number(goal.currentAmount.toFixed(2)) + Number(input.amount)
          ).toFixed(2),
          note: input.note ?? null,
        },
        initiatedBy: 'agent',
      });
      return {
        ok: false,
        retryable: false,
        error: {
          kind: 'CONFIRMATION_REQUIRED',
          stagedActionId: action.id,
          preview: action.preview,
        },
      };
    } catch {
      return {
        ok: false,
        retryable: false,
        error: { kind: 'NOT_FOUND', resource: 'goal', id: input.goalId },
      };
    }
  }
}

// ────────────────────────── Adjust budget line ──────────────────────────

const AdjustLineInput = z.object({
  budgetId: z.string().uuid(),
  lineId: z.string().uuid(),
  newPlannedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
});
type AdjustLineInput = z.infer<typeof AdjustLineInput>;

@Injectable()
export class AdjustBudgetLineTool implements ToolDefinition<AdjustLineInput, unknown> {
  readonly name = 'adjust_budget_line';
  readonly category = 'MUTATION' as const;
  readonly description = 'Stages a change to a budget line planned amount; user must confirm.';
  readonly inputSchema = AdjustLineInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: true };
  readonly sideEffects = { writes: ['BudgetLine'], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly staged: StagedActionsService) {}

  async execute(input: AdjustLineInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    const action = await this.staged.stage({
      userId: ctx.userId,
      actionType: 'budget.adjust-line',
      payload: input as Record<string, unknown>,
      preview: {
        action: 'Змінити плановану суму у бюджеті',
        newPlannedAmount: input.newPlannedAmount,
      },
      initiatedBy: 'agent',
    });
    return {
      ok: false,
      retryable: false,
      error: {
        kind: 'CONFIRMATION_REQUIRED',
        stagedActionId: action.id,
        preview: action.preview,
      },
    };
  }
}

// ────────────────────────── Create Budget ──────────────────────────

const CreateBudgetInput = z.object({
  name: z.string().min(1).max(255),
  method: z
    .enum(['CATEGORY', 'ENVELOPE', 'ZERO_BASED', 'PAY_YOURSELF_FIRST'])
    .optional(),
  cadence: z.enum(['WEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
  baseCurrency: z.enum(['UAH', 'USD', 'EUR', 'GBP', 'PLN']).optional(),
  totalAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  initialLines: z
    .array(
      z.object({
        // Accept either a UUID, a slug, or the raw category name
        // (e.g. "food" / "Їжа"). We resolve to a real id server-side.
        // Pass null for an explicitly uncategorised line.
        categoryId: z.string().nullable().optional(),
        plannedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        thresholdPct: z.number().int().min(1).max(100).optional(),
      }),
    )
    .max(40)
    .optional(),
});
type CreateBudgetInput = z.infer<typeof CreateBudgetInput>;

@Injectable()
export class CreateBudgetTool implements ToolDefinition<CreateBudgetInput, unknown> {
  readonly name = 'create_budget';
  readonly category = 'MUTATION' as const;
  readonly description =
    'Stages creation of a budget with the given name, method, cadence, currency and optional category lines. Returns a stagedActionId; the user must confirm before the budget is created. Use this when the user asks to create a new budget. If they only give a single total (no per-category split), pass it via `totalAmount` and skip `initialLines` — a single uncategorised line will be created.';
  readonly inputSchema = CreateBudgetInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: true };
  readonly sideEffects = {
    writes: ['Budget', 'BudgetPeriod', 'BudgetLine'],
    emitsEvents: ['budget.created'],
    estimatedCost: 'MEDIUM' as const,
  };

  constructor(
    private readonly staged: StagedActionsService,
    private readonly prisma: PrismaService,
    private readonly categoryResolver: CategoryResolverService,
  ) {}

  async execute(
    input: CreateBudgetInput,
    ctx: { userId: string },
  ): Promise<ToolResult<unknown>> {
    const method = input.method ?? 'CATEGORY';
    const cadence = input.cadence ?? 'MONTHLY';
    const baseCurrency = input.baseCurrency ?? 'UAH';

    const rawLines =
      input.initialLines ??
      (input.totalAmount
        ? [
            {
              categoryId: null,
              plannedAmount: input.totalAmount,
              thresholdPct: 80,
            },
          ]
        : []);

    const lines = await this.resolveCategoryHints(rawLines);
    const total =
      input.totalAmount ??
      lines
        .reduce((acc, l) => acc + Number(l.plannedAmount), 0)
        .toFixed(2);

    const previewLines = await this.previewLines(lines, rawLines);

    const action = await this.staged.stage({
      userId: ctx.userId,
      actionType: 'budget.create',
      payload: {
        name: input.name,
        method,
        cadence,
        baseCurrency,
        initialLines: lines,
      } as Record<string, unknown>,
      preview: {
        action: 'Створити бюджет',
        name: input.name,
        method,
        cadence,
        currency: baseCurrency,
        total,
        lines: previewLines,
      },
      initiatedBy: 'agent',
    });
    return {
      ok: false,
      retryable: false,
      error: {
        kind: 'CONFIRMATION_REQUIRED',
        stagedActionId: action.id,
        preview: action.preview,
      },
    };
  }

  private async resolveCategoryHints(
    rawLines: Array<{
      categoryId?: string | null;
      plannedAmount: string;
      thresholdPct?: number;
    }>,
  ): Promise<
    Array<{
      categoryId: string | null;
      plannedAmount: string;
      thresholdPct?: number;
    }>
  > {
    const out: Array<{
      categoryId: string | null;
      plannedAmount: string;
      thresholdPct?: number;
    }> = [];
    for (const l of rawLines) {
      const resolved = await this.categoryResolver.resolve(l.categoryId);
      out.push({
        categoryId: resolved.categoryId,
        plannedAmount: l.plannedAmount,
        thresholdPct: l.thresholdPct,
      });
    }
    return out;
  }

  private async previewLines(
    resolved: Array<{ categoryId: string | null; plannedAmount: string }>,
    raw: Array<{ categoryId?: string | null; plannedAmount: string }>,
  ): Promise<
    Array<{
      category: string;
      plannedAmount: string;
      hint?: string;
      matched: boolean;
    }>
  > {
    const ids = resolved
      .map((l) => l.categoryId)
      .filter((id): id is string => id !== null);
    const cats = ids.length
      ? await this.prisma.category.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    const byId = new Map(cats.map((c) => [c.id, c.name]));
    return resolved.map((l, i) => {
      const hint = raw[i]?.categoryId ?? null;
      const matched = l.categoryId !== null;
      return {
        category: matched
          ? byId.get(l.categoryId!) ?? 'Без категорії'
          : 'Без категорії',
        plannedAmount: l.plannedAmount,
        hint:
          hint && !matched && !UUID_RE.test(hint)
            ? hint
            : undefined,
        matched,
      };
    });
  }
}

// ────────────────────────── Add budget line ──────────────────────────

const AddBudgetLineInput = z.object({
  budgetId: z.string().uuid(),
  // UUID, slug or Ukrainian name; resolved server-side. Pass null for an
  // explicitly uncategorised line.
  categoryId: z.string().nullable().optional(),
  plannedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  thresholdPct: z.number().int().min(1).max(100).optional(),
});
type AddBudgetLineInput = z.infer<typeof AddBudgetLineInput>;

@Injectable()
export class AddBudgetLineTool implements ToolDefinition<AddBudgetLineInput, unknown> {
  readonly name = 'add_budget_line';
  readonly category = 'MUTATION' as const;
  readonly description =
    'Stages addition of a new line to an existing budget. Use this to extend a budget the user already has instead of creating a new one. categoryId may be a UUID, slug, or Ukrainian name — server-resolved.';
  readonly inputSchema = AddBudgetLineInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: true };
  readonly sideEffects = {
    writes: ['BudgetLine'],
    emitsEvents: ['budget.line.added'],
    estimatedCost: 'LOW' as const,
  };

  constructor(
    private readonly staged: StagedActionsService,
    private readonly prisma: PrismaService,
    private readonly categoryResolver: CategoryResolverService,
  ) {}

  async execute(
    input: AddBudgetLineInput,
    ctx: { userId: string },
  ): Promise<ToolResult<unknown>> {
    const match = await this.categoryResolver.resolve(input.categoryId ?? null);
    const resolved = match.categoryId;
    const categoryName = match.matchedName ?? null;

    const action = await this.staged.stage({
      userId: ctx.userId,
      actionType: 'budget.add-line',
      payload: {
        budgetId: input.budgetId,
        categoryId: resolved,
        plannedAmount: input.plannedAmount,
        thresholdPct: input.thresholdPct,
      } as Record<string, unknown>,
      preview: {
        action: 'Додати лінію бюджету',
        category: categoryName ?? 'Без категорії',
        plannedAmount: input.plannedAmount,
        thresholdPct: input.thresholdPct ?? 80,
      },
      initiatedBy: 'agent',
    });
    return {
      ok: false,
      retryable: false,
      error: {
        kind: 'CONFIRMATION_REQUIRED',
        stagedActionId: action.id,
        preview: action.preview,
      },
    };
  }

}

// ────────────────────────── Archive budget ──────────────────────────

const ArchiveBudgetInput = z.object({
  budgetId: z.string().uuid(),
});
type ArchiveBudgetInput = z.infer<typeof ArchiveBudgetInput>;

@Injectable()
export class ArchiveBudgetTool implements ToolDefinition<ArchiveBudgetInput, unknown> {
  readonly name = 'archive_budget';
  readonly category = 'MUTATION' as const;
  readonly description =
    'Stages archival of an existing budget. Use this when the user wants to replace an old budget with a new one — archive first, then create_budget. The budget itself stays in the DB; transactions remain visible.';
  readonly inputSchema = ArchiveBudgetInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: true };
  readonly sideEffects = {
    writes: ['Budget'],
    emitsEvents: ['budget.archived'],
    estimatedCost: 'LOW' as const,
  };

  constructor(
    private readonly staged: StagedActionsService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    input: ArchiveBudgetInput,
    ctx: { userId: string },
  ): Promise<ToolResult<unknown>> {
    const budget = await this.prisma.budget.findFirst({
      where: { id: input.budgetId, userId: ctx.userId },
      select: { id: true, name: true },
    });
    if (!budget) {
      return {
        ok: false,
        retryable: false,
        error: { kind: 'NOT_FOUND', resource: 'budget', id: input.budgetId },
      };
    }
    const action = await this.staged.stage({
      userId: ctx.userId,
      actionType: 'budget.archive',
      payload: { budgetId: budget.id } as Record<string, unknown>,
      preview: {
        action: 'Заархівувати бюджет',
        name: budget.name,
      },
      initiatedBy: 'agent',
    });
    return {
      ok: false,
      retryable: false,
      error: {
        kind: 'CONFIRMATION_REQUIRED',
        stagedActionId: action.id,
        preview: action.preview,
      },
    };
  }
}

// ────────────────────────── Recommendation feedback ──────────────────────────

const AcceptRecInput = z.object({
  recommendationId: z.string().uuid(),
});
type AcceptRecInput = z.infer<typeof AcceptRecInput>;

@Injectable()
export class AcceptRecommendationTool implements ToolDefinition<AcceptRecInput, unknown> {
  readonly name = 'accept_recommendation';
  readonly category = 'MUTATION' as const;
  readonly description = 'Accepts a recommendation on the user’s behalf (single-step — low risk).';
  readonly inputSchema = AcceptRecInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = {
    writes: ['Recommendation', 'RecommendationFeedback'],
    emitsEvents: ['recommendation.accepted'],
    estimatedCost: 'LOW' as const,
  };

  constructor(private readonly recommendations: RecommendationsService) {}

  async execute(input: AcceptRecInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    try {
      const rec = await this.recommendations.accept(ctx.userId, input.recommendationId);
      return { ok: true, data: { id: rec.id, status: rec.status } };
    } catch {
      return {
        ok: false,
        retryable: false,
        error: { kind: 'NOT_FOUND', resource: 'recommendation', id: input.recommendationId },
      };
    }
  }
}

@Injectable()
export class SnoozeRecommendationTool implements ToolDefinition<AcceptRecInput, unknown> {
  readonly name = 'snooze_recommendation';
  readonly category = 'MUTATION' as const;
  readonly description = 'Snoozes a recommendation for 24h.';
  readonly inputSchema = AcceptRecInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = {
    writes: ['Recommendation', 'RecommendationFeedback'],
    emitsEvents: ['recommendation.snoozed'],
    estimatedCost: 'LOW' as const,
  };

  constructor(private readonly recommendations: RecommendationsService) {}

  async execute(input: AcceptRecInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    try {
      const rec = await this.recommendations.snooze(ctx.userId, input.recommendationId, 24);
      return { ok: true, data: { id: rec.id, status: rec.status } };
    } catch {
      return {
        ok: false,
        retryable: false,
        error: { kind: 'NOT_FOUND', resource: 'recommendation', id: input.recommendationId },
      };
    }
  }
}

// ────────────────────────── Confirmation executor ──────────────────────────

/**
 * Server-side confirm: turns a staged_action into a real mutation.
 * Routes by `actionType` to the appropriate domain service.
 */
@Injectable()
export class StagedActionExecutor {
  constructor(
    private readonly staged: StagedActionsService,
    private readonly goals: GoalsService,
    private readonly budgeting: BudgetingService,
  ) {}

  async confirmAndExecute(userId: string, stagedActionId: string): Promise<unknown> {
    const action = await this.staged.confirm(userId, stagedActionId);
    return this.execute(userId, action.actionType, action.payload);
  }

  private async execute(
    userId: string,
    actionType: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    switch (actionType) {
      case 'goal.create': {
        return this.goals.createGoal({
          userId,
          type: payload.type as 'SAVING' | 'DEBT_PAYOFF' | 'INVESTMENT' | 'PURCHASE',
          name: payload.name as string,
          targetAmount: payload.targetAmount as string,
          baseCurrency: payload.baseCurrency as Currency,
          deadline: payload.deadline ? new Date(payload.deadline as string) : undefined,
          priority: payload.priority as number | undefined,
          description: payload.description as string | undefined,
        });
      }
      case 'goal.contribute':
        return this.goals.contribute(userId, {
          goalId: payload.goalId as string,
          amount: payload.amount as string,
          sourceType: 'MANUAL',
        });
      case 'budget.adjust-line':
        return this.budgeting.adjustLine(userId, {
          budgetId: payload.budgetId as string,
          lineId: payload.lineId as string,
          newPlannedAmount: payload.newPlannedAmount as string,
        });
      case 'budget.add-line':
        return this.budgeting.addLine(userId, {
          budgetId: payload.budgetId as string,
          categoryId: (payload.categoryId as string | null) ?? null,
          plannedAmount: payload.plannedAmount as string,
          thresholdPct: payload.thresholdPct as number | undefined,
        });
      case 'budget.archive':
        return this.budgeting.archive(userId, payload.budgetId as string);
      case 'budget.create':
        return this.budgeting.createBudget({
          userId,
          name: payload.name as string,
          method: payload.method as
            | 'CATEGORY'
            | 'ENVELOPE'
            | 'ZERO_BASED'
            | 'PAY_YOURSELF_FIRST',
          cadence: payload.cadence as 'WEEKLY' | 'MONTHLY' | 'CUSTOM',
          baseCurrency: payload.baseCurrency as Currency,
          initialLines: (payload.initialLines as
            | Array<{
                categoryId: string | null;
                plannedAmount: string;
                thresholdPct?: number;
              }>
            | undefined) ?? [],
          startNow: true,
        });
      default:
        throw new Error(`Unknown staged action type: ${actionType}`);
    }
  }
}
