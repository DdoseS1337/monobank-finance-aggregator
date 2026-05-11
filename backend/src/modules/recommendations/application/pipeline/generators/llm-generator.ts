import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../../../../shared-kernel/ai/llm.service';
import { MemoryService } from '../../../../ai/memory/application/memory.service';
import { Recommendation, RecommendationKind } from '../../../domain/recommendation.entity';
import { UserContext } from '../context-builder.service';
import { RecommendationGenerator } from './generator.interface';

const SYSTEM_PROMPT = `You are a personal-finance advisory agent.
Given a JSON snapshot of the user's finances and recent semantic memories about
their preferences, suggest UP TO 3 actionable recommendations of kinds:
SPENDING | SAVING | BEHAVIORAL.

Rules:
- ONLY emit ideas that the rule-based generator cannot derive from a single
  signal — focus on cross-domain patterns (e.g. spending + goal trade-offs).
- Be concrete: include a number, a category, or a goal name.
- Output language: Ukrainian.
- JSON shape: { "recommendations": [{ "kind": "...", "priority": 1..4,
   "explanation": string, "rationale": string,
   "expected_amount": number|null }] }.
- If you cannot find anything novel, output { "recommendations": [] }.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recommendations: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['SPENDING', 'SAVING', 'BEHAVIORAL'] },
          priority: { type: 'integer', minimum: 1, maximum: 4 },
          explanation: { type: 'string', minLength: 10, maxLength: 500 },
          rationale: { type: 'string', minLength: 5, maxLength: 500 },
          expected_amount: { type: ['number', 'null'] },
        },
        required: ['kind', 'priority', 'explanation', 'rationale', 'expected_amount'],
      },
    },
  },
  required: ['recommendations'],
};

interface LlmOutput {
  recommendations: Array<{
    kind: 'SPENDING' | 'SAVING' | 'BEHAVIORAL';
    priority: number;
    explanation: string;
    rationale: string;
    expected_amount: number | null;
  }>;
}

const VALID_FOR_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * LLM-based generator. Returns nothing when:
 *   - no API key configured
 *   - LLM call fails
 *   - LLM returns empty list
 *
 * Uses cheap model — recommendations are short and the bulk of the cost
 * comes from frequency rather than per-call complexity.
 */
@Injectable()
export class LlmGenerator implements RecommendationGenerator {
  readonly name = 'llm';
  private readonly logger = new Logger(LlmGenerator.name);

  constructor(
    private readonly llm: LlmService,
    private readonly memory: MemoryService,
  ) {}

  async generate(ctx: UserContext): Promise<Recommendation[]> {
    if (!this.llm.isAvailable()) return [];

    const memories = await this.memory.recall({
      userId: ctx.userId,
      query: 'user financial preferences and behavior patterns',
      kinds: ['SEMANTIC'],
      topK: 8,
    });
    const memoryLines = memories.map((m, i) => `[${i + 1}] ${m.record.content}`).join('\n');

    const userPrompt =
      `User snapshot:\n${JSON.stringify(this.sliceContext(ctx))}\n\n` +
      (memoryLines ? `Known preferences:\n${memoryLines}\n\n` : '') +
      `Suggest up to 3 actionable recommendations following the schema.`;

    const completion = await this.llm.complete({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      jsonSchema: { name: 'recommendation_schema', schema: SCHEMA },
      cheap: true,
      temperature: 0.5,
      maxTokens: 700,
    });
    if (!completion?.json) return [];

    const out = completion.json as LlmOutput;
    if (!out.recommendations?.length) return [];

    return out.recommendations.map((r) =>
      Recommendation.create({
        userId: ctx.userId,
        kind: r.kind as RecommendationKind,
        generatedBy: 'llm',
        priority: r.priority,
        payload: {
          rationale: r.rationale,
          model: completion.model,
          tokens: { in: completion.tokensIn, out: completion.tokensOut },
          costUsd: completion.costUsd,
        },
        explanation: r.explanation,
        expectedImpact: r.expected_amount
          ? {
              financial: { amount: r.expected_amount.toFixed(2), currency: ctx.baseCurrency },
              timeframe: '30d',
              description: r.rationale,
            }
          : undefined,
        validForMs: VALID_FOR_MS,
        generatorMetadata: { source: 'llm' },
      }),
    );
  }

  /** Trim context for the LLM prompt — drops verbose collections to keep tokens cheap. */
  private sliceContext(ctx: UserContext) {
    return {
      totalBalance: ctx.totalBalance.toFixed(2),
      baseCurrency: ctx.baseCurrency,
      budgets: ctx.budgets.map((b) => ({
        name: b.name,
        method: b.method,
        healthStatus: b.healthStatus,
        linesAtRisk: b.lines.filter((l) => l.status !== 'OK').length,
      })),
      goals: ctx.goals.map((g) => ({
        name: g.name,
        progressPct: g.progressPct,
        feasibilityScore: g.feasibilityScore,
        priority: g.priority,
      })),
      cashflow: {
        confidenceScore: ctx.cashflow.confidenceScore,
        nextDeficit: ctx.cashflow.nextDeficit,
      },
      topCategories: ctx.recentSpendingByCategory.slice(0, 5),
      activeSubscriptions: ctx.subscriptions.length,
    };
  }
}
