import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import dayjs from 'dayjs';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';
import { FxRatesService } from '../../../fx/fx-rates.service';
import { ToolDefinition, ToolResult } from '../tool.interface';

const NoInput = z.object({});
type NoInput = z.infer<typeof NoInput>;

const TransactionsInput = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  type: z.enum(['DEBIT', 'CREDIT', 'TRANSFER', 'HOLD']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
type TransactionsInput = z.infer<typeof TransactionsInput>;

@Injectable()
export class GetCategoriesTool implements ToolDefinition<NoInput, unknown> {
  readonly name = 'get_categories';
  readonly category = 'READ' as const;
  readonly description =
    'Returns the catalog of expense / income categories: id, slug, name (Ukrainian), parent slug, system flag. Use this BEFORE create_budget / create_goal whenever the user mentions category names — pass each resolved id into initialLines[].categoryId. Slugs are stable, names may match user phrasing better.';
  readonly inputSchema = NoInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'PUBLIC' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<ToolResult<unknown>> {
    const cats = await this.prisma.category.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        parent: { select: { slug: true } },
        isSystem: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return {
      ok: true,
      data: cats.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        parentSlug: c.parent?.slug ?? null,
        isSystem: c.isSystem,
      })),
    };
  }
}

@Injectable()
export class GetBudgetsTool implements ToolDefinition<NoInput, unknown> {
  readonly name = 'get_budgets';
  readonly category = 'READ' as const;
  readonly description =
    'Returns active budgets for the current user with per-line spending and health.';
  readonly inputSchema = NoInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly prisma: PrismaService) {}

  async execute(_input: NoInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    const budgets = await this.prisma.budget.findMany({
      where: { userId: ctx.userId, status: 'ACTIVE' },
      include: {
        periods: {
          where: { status: 'OPEN' },
          include: { lines: { include: { category: { select: { name: true, slug: true } } } } },
          take: 1,
        },
      },
    });
    const data = budgets.map((b) => ({
      id: b.id,
      name: b.name,
      method: b.method,
      cadence: b.cadence,
      currentPeriod: b.periods[0]
        ? {
            id: b.periods[0].id,
            start: b.periods[0].periodStart,
            end: b.periods[0].periodEnd,
            lines: b.periods[0].lines.map((l) => ({
              category: l.category?.name ?? 'Uncategorised',
              categorySlug: l.category?.slug ?? null,
              planned: Number(l.plannedAmount),
              spent: Number(l.spentAmount),
              spentPct:
                Number(l.plannedAmount) > 0
                  ? Math.round((Number(l.spentAmount) / Number(l.plannedAmount)) * 100)
                  : 0,
              status: l.status,
            })),
          }
        : null,
    }));
    return { ok: true, data };
  }
}

@Injectable()
export class GetGoalsTool implements ToolDefinition<NoInput, unknown> {
  readonly name = 'get_goals';
  readonly category = 'READ' as const;
  readonly description = 'Returns active financial goals with progress and feasibility scores.';
  readonly inputSchema = NoInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly prisma: PrismaService) {}

  async execute(_input: NoInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    const goals = await this.prisma.goal.findMany({
      where: { userId: ctx.userId, status: { in: ['ACTIVE', 'PAUSED'] } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    return {
      ok: true,
      data: goals.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        progressPct:
          Number(g.targetAmount) > 0
            ? Math.round((Number(g.currentAmount) / Number(g.targetAmount)) * 100)
            : 0,
        baseCurrency: g.baseCurrency,
        deadline: g.deadline,
        priority: g.priority,
        feasibilityScore: g.feasibilityScore !== null ? Number(g.feasibilityScore) : null,
        status: g.status,
      })),
    };
  }
}

@Injectable()
export class GetCashflowTool implements ToolDefinition<NoInput, unknown> {
  readonly name = 'get_cashflow';
  readonly category = 'READ' as const;
  readonly description =
    'Returns the latest cashflow projection (P10/P50/P90 trajectories) plus open deficit predictions.';
  readonly inputSchema = NoInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly prisma: PrismaService) {}

  async execute(_input: NoInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    const projection = await this.prisma.cashFlowProjection.findFirst({
      where: { userId: ctx.userId, isLatest: true },
      include: {
        points: { orderBy: { day: 'asc' } },
        deficitPredictions: { where: { resolvedAt: null }, orderBy: { predictedFor: 'asc' } },
      },
    });
    if (!projection) {
      return { ok: true, data: { hasProjection: false } };
    }
    return {
      ok: true,
      data: {
        hasProjection: true,
        id: projection.id,
        horizonDays: projection.horizonDays,
        confidenceScore: projection.confidenceScore !== null ? Number(projection.confidenceScore) : null,
        modelVersion: projection.modelVersion,
        // Trim points to weekly samples to keep the LLM context tight.
        sampledPoints: projection.points
          .filter((_, i) => i % 7 === 0)
          .map((p) => ({
            day: p.day,
            balanceP10: Number(p.balanceP10 ?? 0),
            balanceP50: Number(p.balanceP50 ?? 0),
            balanceP90: Number(p.balanceP90 ?? 0),
            hasDeficitRisk: p.hasDeficitRisk,
          })),
        deficits: projection.deficitPredictions.map((d) => ({
          predictedFor: d.predictedFor,
          estimatedAmount: Number(d.estimatedAmount),
          confidence: Number(d.confidence),
        })),
      },
    };
  }
}

@Injectable()
export class GetRecommendationsTool implements ToolDefinition<NoInput, unknown> {
  readonly name = 'get_recommendations';
  readonly category = 'READ' as const;
  readonly description = 'Returns currently pending or delivered recommendations for the user.';
  readonly inputSchema = NoInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly prisma: PrismaService) {}

  async execute(_input: NoInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    const items = await this.prisma.recommendation.findMany({
      where: { userId: ctx.userId, status: { in: ['PENDING', 'DELIVERED'] } },
      orderBy: [{ priority: 'asc' }, { rankingScore: 'desc' }, { generatedAt: 'desc' }],
      take: 20,
    });
    return {
      ok: true,
      data: items.map((r) => ({
        id: r.id,
        kind: r.kind,
        priority: r.priority,
        explanation: r.explanation,
        rankingScore: r.rankingScore !== null ? Number(r.rankingScore) : null,
        validUntil: r.validUntil,
      })),
    };
  }
}

@Injectable()
export class GetTransactionsTool implements ToolDefinition<TransactionsInput, unknown> {
  readonly name = 'get_transactions';
  readonly category = 'READ' as const;
  readonly description =
    'Returns transactions for a period AND server-computed aggregates. ' +
    'For ANY "скільки я витратив за період X" question, cite totalSpend ' +
    'directly — never sum the items list, it is capped at `limit` (default 50) ' +
    'and silently undercounts active months. ' +
    'Aggregates use the same filter as explain_spending_change (DEBIT + ' +
    'POSTED|PENDING + dominant currency) so the two tools reconcile. ' +
    'Returns: { items, totalSpend, totalIncome, spendCount, incomeCount, ' +
    'currency, truncated }.';
  readonly inputSchema = TransactionsInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly prisma: PrismaService) {}

  async execute(input: TransactionsInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    const limit = input.limit ?? 50;
    const from = input.fromDate ? new Date(input.fromDate) : dayjs().subtract(30, 'day').toDate();
    const to = input.toDate ? new Date(input.toDate) : new Date();
    const baseWhere = {
      userId: ctx.userId,
      transactionDate: { gte: from, lte: to },
      ...(input.type ? { type: input.type } : {}),
    } as const;

    // Server-side aggregates over the FULL period (not the truncated slice).
    // We mirror explain_spending_change's filter so totalSpend equals
    // periodA.spend / periodB.spend in that tool — otherwise an LLM asking
    // for a delta gets numbers that don't reconcile across tools.
    const aggregateRows = await this.prisma.transaction.groupBy({
      by: ['type', 'currency'],
      where: {
        ...baseWhere,
        status: { in: ['POSTED', 'PENDING'] },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    let totalSpend = 0;
    let totalIncome = 0;
    let spendCount = 0;
    let incomeCount = 0;
    let dominantCurrency = 'UAH';
    const currencyTotals = new Map<string, number>();
    for (const row of aggregateRows) {
      const sum = Number(row._sum.amount ?? 0);
      currencyTotals.set(
        row.currency,
        (currencyTotals.get(row.currency) ?? 0) + Math.abs(sum),
      );
    }
    let max = -1;
    for (const [cur, vol] of currencyTotals) {
      if (vol > max) {
        max = vol;
        dominantCurrency = cur;
      }
    }
    for (const row of aggregateRows) {
      if (row.currency !== dominantCurrency) continue;
      const sum = Number(row._sum.amount ?? 0);
      if (row.type === 'DEBIT') {
        totalSpend += sum;
        spendCount += row._count._all;
      } else if (row.type === 'CREDIT') {
        totalIncome += sum;
        incomeCount += row._count._all;
      }
    }
    totalSpend = round2(totalSpend);
    totalIncome = round2(totalIncome);

    const items = await this.prisma.transaction.findMany({
      where: baseWhere,
      orderBy: { transactionDate: 'desc' },
      take: limit,
      include: { category: { select: { name: true, slug: true } } },
    });

    const totalMatchingItems = await this.prisma.transaction.count({
      where: baseWhere,
    });

    return {
      ok: true,
      data: {
        period: { from: from.toISOString(), to: to.toISOString() },
        currency: dominantCurrency,
        totalSpend,
        totalIncome,
        spendCount,
        incomeCount,
        truncated: totalMatchingItems > items.length,
        returnedCount: items.length,
        matchingCount: totalMatchingItems,
        items: items.map((t) => ({
          id: t.id,
          date: t.transactionDate,
          amount: Number(t.amount),
          currency: t.currency,
          type: t.type,
          merchant: t.merchantName,
          description: t.description,
          category: t.category?.name ?? null,
          categorySlug: t.category?.slug ?? null,
          mccCode: t.mccCode,
        })),
      },
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const ISO_CODE = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'Must be an ISO 4217 alpha-3 code');

const FxRateInput = z.object({
  from: ISO_CODE.optional(),
  to: ISO_CODE.optional(),
  amount: z.number().positive().optional(),
});
type FxRateInput = z.infer<typeof FxRateInput>;

@Injectable()
export class GetFxRateTool implements ToolDefinition<FxRateInput, unknown> {
  readonly name = 'get_fx_rate';
  readonly category = 'READ' as const;
  readonly description =
    'Returns live currency exchange rates from Monobank. Without args returns all pairs Monobank publishes. With `from`+`to` (any ISO 4217 alpha-3 code, e.g. SEK, JPY, CHF) returns the rate for that pair; the service auto-triangulates via UAH if a direct quote is missing. If `amount` is provided, also returns the converted amount. Returns an EXTERNAL error if Monobank does not list the requested pair.';
  readonly inputSchema = FxRateInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly fx: FxRatesService) {}

  async execute(input: FxRateInput): Promise<ToolResult<unknown>> {
    const from = input.from?.toUpperCase();
    const to = input.to?.toUpperCase();
    if (from && to) {
      try {
        const conversion = await this.fx.convert(input.amount ?? 1, from, to);
        return {
          ok: true,
          data: {
            from,
            to,
            rate: conversion.rate,
            amountIn: input.amount ?? 1,
            amountOut: conversion.amount,
            asOf: conversion.asOf,
          },
        };
      } catch (error) {
        return {
          ok: false,
          retryable: true,
          error: {
            kind: 'EXTERNAL',
            service: 'monobank',
            details: (error as Error).message,
          },
        };
      }
    }
    const all = await this.fx.listSupported();
    return { ok: true, data: all };
  }
}

@Injectable()
export class GetSubscriptionsTool implements ToolDefinition<NoInput, unknown> {
  readonly name = 'get_subscriptions';
  readonly category = 'READ' as const;
  readonly description = 'Returns active recurring subscriptions detected for the user.';
  readonly inputSchema = NoInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly prisma: PrismaService) {}

  async execute(_input: NoInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    const subs = await this.prisma.subscription.findMany({
      where: { userId: ctx.userId, status: 'ACTIVE' },
      orderBy: { estimatedAmount: 'desc' },
    });
    return {
      ok: true,
      data: subs.map((s) => ({
        id: s.id,
        merchantName: s.merchantName,
        estimatedAmount: Number(s.estimatedAmount),
        currency: s.currency,
        cadence: s.cadence,
        nextDueDate: s.nextDueDate,
        unusedDaysCount: s.unusedDaysCount,
        isEssential: s.isEssential,
      })),
    };
  }
}
