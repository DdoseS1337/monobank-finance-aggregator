import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CashflowService } from '../../../cashflow/application/cashflow.service';
import { ScenariosService } from '../../../cashflow/application/scenarios.service';
import { ScenarioVariableKind } from '../../../cashflow/domain/scenario.entity';
import { RecommendationsService } from '../../../recommendations/application/recommendations.service';
import { EducationService } from '../../../education/education.service';
import { SpendingDecompositionService } from '../../../transactions/application/spending-decomposition.service';
import { MemoryService } from '../../memory/application/memory.service';
import { ToolDefinition, ToolResult } from '../tool.interface';

const RunScenarioInput = z.object({
  name: z.string().min(1).max(255),
  variables: z
    .array(z.object({
      kind: z.enum(['INCOME_DELTA', 'CATEGORY_DELTA', 'NEW_GOAL', 'NEW_RECURRING']),
      // Loosened — concrete shape is validated downstream by the Scenario domain.
    }).passthrough())
    .min(1)
    .max(10),
});
type RunScenarioInput = z.infer<typeof RunScenarioInput>;

@Injectable()
export class RunScenarioTool implements ToolDefinition<RunScenarioInput, unknown> {
  readonly name = 'run_scenario';
  readonly category = 'COGNITIVE' as const;
  readonly description =
    'Runs a Monte Carlo what-if scenario against the latest cashflow projection ' +
    'and returns the modified outcomes (delta vs baseline).';
  readonly inputSchema = RunScenarioInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = {
    writes: ['Scenario'],
    emitsEvents: ['cashflow.scenario.simulated'],
    estimatedCost: 'HIGH' as const,
  };

  constructor(private readonly scenarios: ScenariosService) {}

  async execute(input: RunScenarioInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    try {
      const scenario = await this.scenarios.create({
        userId: ctx.userId,
        name: input.name,
        variables: input.variables as unknown as ScenarioVariableKind[],
        runNow: true,
      });
      return {
        ok: true,
        data: {
          scenarioId: scenario.id,
          outcomes: scenario.outcomes,
        },
      };
    } catch (error) {
      return {
        ok: false,
        retryable: false,
        error: { kind: 'INTERNAL', correlationId: ctx.userId },
        ...{ debug: (error as Error).message },
      } as ToolResult<unknown>;
    }
  }
}

const ExplainRecommendationInput = z.object({
  recommendationId: z.string().uuid(),
});
type ExplainRecommendationInput = z.infer<typeof ExplainRecommendationInput>;

@Injectable()
export class ExplainRecommendationTool
  implements ToolDefinition<ExplainRecommendationInput, unknown>
{
  readonly name = 'explain_recommendation';
  readonly category = 'COGNITIVE' as const;
  readonly description =
    'Returns the structured ranking breakdown and inputs of a recommendation so the agent can defend its reasoning.';
  readonly inputSchema = ExplainRecommendationInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly recommendations: RecommendationsService) {}

  async execute(
    input: ExplainRecommendationInput,
    ctx: { userId: string },
  ): Promise<ToolResult<unknown>> {
    try {
      const rec = await this.recommendations.getOne(ctx.userId, input.recommendationId);
      return {
        ok: true,
        data: {
          id: rec.id,
          kind: rec.kind,
          generatedBy: rec.generatedBy,
          explanation: rec.explanation,
          rankingBreakdown: rec.ranking?.toJSON() ?? null,
          payload: rec.payload,
          expectedImpact: rec.expectedImpact,
        },
      };
    } catch {
      return {
        ok: false,
        retryable: false,
        error: { kind: 'NOT_FOUND', resource: 'recommendation', id: input.recommendationId },
      };
    }
  }
}

const RecallMemoryInput = z.object({
  query: z.string().min(2).max(500),
  topK: z.number().int().min(1).max(20).optional(),
});
type RecallMemoryInput = z.infer<typeof RecallMemoryInput>;

@Injectable()
export class RecallMemoryTool implements ToolDefinition<RecallMemoryInput, unknown> {
  readonly name = 'recall_memory';
  readonly category = 'MEMORY' as const;
  readonly description =
    'Retrieves up to topK semantic / episodic memories about the user that are most relevant to the query.';
  readonly inputSchema = RecallMemoryInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'MEDIUM' as const };

  constructor(private readonly memory: MemoryService) {}

  async execute(input: RecallMemoryInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    const results = await this.memory.recall({
      userId: ctx.userId,
      query: input.query,
      topK: input.topK ?? 8,
    });
    return {
      ok: true,
      data: results.map((r) => ({
        kind: r.record.kind,
        content: r.record.content,
        importance: r.record.importanceScore,
        score: r.score,
        accessedAt: r.record.accessedAt,
      })),
    };
  }
}

const NoInput = z.object({});
type NoInput = z.infer<typeof NoInput>;

@Injectable()
export class GetCashflowSummaryTool implements ToolDefinition<NoInput, unknown> {
  readonly name = 'get_cashflow_summary';
  readonly category = 'COGNITIVE' as const;
  readonly description =
    'Returns a compact textual summary of the latest cashflow projection: balance trajectory, deficits, confidence.';
  readonly inputSchema = NoInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly cashflow: CashflowService) {}

  async execute(_input: NoInput, ctx: { userId: string }): Promise<ToolResult<unknown>> {
    const projection = await this.cashflow.getLatest(ctx.userId);
    if (!projection) {
      return { ok: true, data: { hasProjection: false } };
    }
    const deficits = projection.detectDeficitWindows();
    return {
      ok: true,
      data: {
        hasProjection: true,
        horizonDays: projection.horizonDays,
        confidenceScore: projection.confidenceScore,
        deficitWindows: deficits.map((d) => ({
          start: d.start,
          end: d.end,
          worstDay: d.worstDay,
          worstAmount: d.worstAmount,
          confidence: d.confidence,
        })),
        endBalanceP50: projection.points.length > 0
          ? Number(projection.points[projection.points.length - 1]!.p50)
          : null,
      },
    };
  }
}

// ────────────────────────── Lookup financial education ──────────────────────────

const LookupEducationInput = z.object({
  query: z.string().min(2).max(500),
  k: z.number().int().min(1).max(8).optional(),
});
type LookupEducationInput = z.infer<typeof LookupEducationInput>;

@Injectable()
export class LookupEducationTool
  implements ToolDefinition<LookupEducationInput, unknown>
{
  readonly name = 'lookup_education';
  readonly category = 'COGNITIVE' as const;
  readonly description =
    'Searches the Ukrainian financial-literacy knowledge base via vector similarity. Returns up to k short articles (id, title, section, content excerpt, similarity). Use this BEFORE giving any general financial advice (about taxes, ОВДП, depositing, інвестицій, поведінкових пасток, кешбеку, ФОП, єОселя, тощо) — quote the article and cite its title in your response so the user knows the answer is grounded.';
  readonly inputSchema = LookupEducationInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'PUBLIC' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly education: EducationService) {}

  async execute(input: LookupEducationInput): Promise<ToolResult<unknown>> {
    const hits = await this.education.search(input.query, { k: input.k ?? 4 });
    return {
      ok: true,
      data: {
        query: input.query,
        hits: hits.map((h) => ({
          id: h.id,
          title: h.title,
          section: h.section,
          source: h.source,
          excerpt:
            h.content.length > 1200 ? `${h.content.slice(0, 1200)}…` : h.content,
          similarity: Number(h.similarity.toFixed(4)),
        })),
      },
    };
  }
}

// ────────────────────────── Calculator ──────────────────────────

const CalculateInput = z.object({
  // Long enough to sum a month of transactions inline. Hard cap stays well
  // below what JS can parse, but big enough that an agent rarely needs to
  // chunk the calculation by hand.
  expression: z.string().min(1).max(2000),
  /** Optional, for the agent to label the result (e.g. "monthly food budget"). */
  label: z.string().max(80).optional(),
});
type CalculateInput = z.infer<typeof CalculateInput>;

const SAFE_EXPR = /^[\d\s+\-*/().]+$/;

// Currency markers LLMs frequently paste in; stripped before arithmetic check.
// Order matters: longer alphabetic markers before shorter / symbol ones.
const CURRENCY_TOKEN = /(UAH|USD|EUR|GBP|PLN|грн|укр|₴|\$|€|£|¥)/gi;

@Injectable()
export class CalculateTool implements ToolDefinition<CalculateInput, unknown> {
  readonly name = 'calculate';
  readonly category = 'COGNITIVE' as const;
  readonly description =
    'Evaluates a SIMPLE arithmetic expression (+, -, *, /, parentheses, decimals). Use this for ANY sum, multiplication, currency conversion, or percentage that combines numbers from other tool calls — never compute arithmetic in your head. Example: after get_fx_rate returned rate=43.87, call calculate("650 * 43.87"). Result is exact and is recorded as a tool output, so the verification layer can confirm the number you cite. Comma in numbers is treated as decimal point. Anything other than the listed operators is rejected.';
  readonly inputSchema = CalculateInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'PUBLIC' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  async execute(input: CalculateInput): Promise<ToolResult<unknown>> {
    // Normalise comma decimals (UA/EU style) to dots, drop space thousands.
    const normalised = input.expression
      .replace(/[\s  ]/g, '')
      .replace(CURRENCY_TOKEN, '')
      .replace(/(\d)_(?=\d)/g, '$1')
      .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
      .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');

    if (!SAFE_EXPR.test(normalised)) {
      const offenders = Array.from(
        new Set(normalised.replace(/[\d+\-*/().]/g, '')),
      ).join('');
      return {
        ok: false,
        retryable: false,
        error: {
          kind: 'VALIDATION',
          field: 'expression',
          message:
            `Expression contains disallowed characters: "${offenders}". ` +
            'Allowed: digits, + - * / ( ) and dot for decimals. ' +
            'Strip currency names, units, variable names — pass only the arithmetic.',
        },
      };
    }
    // Reject suspicious patterns the regex alone can't catch (e.g. unbalanced parens).
    if (!this.balancedParens(normalised)) {
      return {
        ok: false,
        retryable: false,
        error: {
          kind: 'VALIDATION',
          field: 'expression',
          message: 'Unbalanced parentheses.',
        },
      };
    }

    let value: number;
    try {
      // Safe because the whitelist + balanced-paren check above limits the
      // expression to pure arithmetic. No identifiers, no function calls.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      value = Function(`"use strict"; return (${normalised});`)() as number;
    } catch (error) {
      return {
        ok: false,
        retryable: false,
        error: {
          kind: 'VALIDATION',
          field: 'expression',
          message: `Failed to evaluate: ${(error as Error).message}`,
        },
      };
    }
    if (!Number.isFinite(value)) {
      return {
        ok: false,
        retryable: false,
        error: {
          kind: 'VALIDATION',
          field: 'expression',
          message: 'Expression produced a non-finite result (division by zero?).',
        },
      };
    }
    const rounded = Math.round(value * 100) / 100;
    return {
      ok: true,
      data: {
        expression: input.expression,
        normalisedExpression: normalised,
        result: rounded,
        label: input.label ?? null,
      },
    };
  }

  private balancedParens(s: string): boolean {
    let depth = 0;
    for (const ch of s) {
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth < 0) return false;
      }
    }
    return depth === 0;
  }
}

// ────────────────────────── Explain spending change (causal) ──────────────────────────

const ExplainSpendingChangeInput = z.object({
  fromA: z.string(),
  toA: z.string(),
  fromB: z.string(),
  toB: z.string(),
  groupBy: z.enum(['merchant', 'category']).optional(),
  topN: z.number().int().min(1).max(20).optional(),
});
type ExplainSpendingChangeInput = z.infer<typeof ExplainSpendingChangeInput>;

@Injectable()
export class ExplainSpendingChangeTool
  implements ToolDefinition<ExplainSpendingChangeInput, unknown>
{
  readonly name = 'explain_spending_change';
  readonly category = 'COGNITIVE' as const;
  readonly description =
    'Causal decomposition of spending change between two periods. Returns: (1) totals.delta — the absolute change spendB − spendA, ALWAYS cite this directly for the overall number, never sum the effects yourself; (2) priceEffect / volumeEffect / crossEffect / mixInEffect / mixOutEffect — five named components that exactly sum to totals.delta; (3) a pre-rendered Ukrainian narrative string covering all five effects plus top contributors — prefer quoting it verbatim; (4) topIncreases and topDecreases — top 5 merchants or categories driving the change, each with reason (PRICE / VOLUME / NEW / DROPPED / MIXED). Pass groupBy: "category" for category-level questions, "merchant" (default) for merchant-level ones. Pass ISO dates for fromA/toA (baseline) and fromB/toB (comparison).';
  readonly inputSchema = ExplainSpendingChangeInput;
  readonly outputSchema = z.unknown();
  readonly authorization = { scope: 'OWN_DATA' as const, requiresConfirmation: false };
  readonly sideEffects = { writes: [], emitsEvents: [], estimatedCost: 'LOW' as const };

  constructor(private readonly decomp: SpendingDecompositionService) {}

  async execute(
    input: ExplainSpendingChangeInput,
    ctx: { userId: string },
  ): Promise<ToolResult<unknown>> {
    const report = await this.decomp.decompose({
      userId: ctx.userId,
      periodA: { from: new Date(input.fromA), to: new Date(input.toA) },
      periodB: { from: new Date(input.fromB), to: new Date(input.toB) },
      groupBy: input.groupBy,
    });
    const topN = input.topN ?? 8;
    return {
      ok: true,
      data: {
        ...report,
        items: report.items.slice(0, topN),
        truncated: report.items.length > topN,
      },
    };
  }
}
