import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { Recommendation } from '../../../domain/recommendation.entity';
import { UserContext } from '../context-builder.service';
import { RecommendationGenerator } from './generator.interface';

const DEFAULT_VALID_FOR_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Rule-based generator emits deterministic recommendations from clear,
 * inspectable signals: budget overruns, unused subscriptions, cashflow
 * deficit predictions, low-feasibility goals.
 *
 * Priorities follow the docs/02-BACKEND-MODULES.md taxonomy:
 *   1 — critical (cashflow deficit, exceeded essential category)
 *   2 — high    (goal at risk, repeated overrun)
 *   3 — medium  (warning thresholds, unused subscriptions)
 *   4 — low     (nudges, behavioral)
 */
@Injectable()
export class RuleBasedGenerator implements RecommendationGenerator {
  readonly name = 'rules';

  async generate(ctx: UserContext): Promise<Recommendation[]> {
    const candidates: Recommendation[] = [];

    // 1. Cashflow deficit predicted
    if (ctx.cashflow.nextDeficit) {
      const deficit = ctx.cashflow.nextDeficit;
      const daysAhead = dayjs(deficit.day).diff(dayjs(), 'day');
      candidates.push(
        Recommendation.create({
          userId: ctx.userId,
          kind: 'CASHFLOW',
          generatedBy: 'rules',
          priority: 1,
          payload: {
            reason: 'predicted_deficit',
            predictedFor: deficit.day.toISOString(),
            estimatedAmount: deficit.estimatedAmount,
            confidence: deficit.confidence,
            daysAhead,
          },
          explanation:
            `За ${daysAhead} днів модель прогнозує дефіцит ${Math.abs(deficit.estimatedAmount).toFixed(2)} ₴ ` +
            `(довіра ${Math.round(deficit.confidence * 100)}%). Розгляньте перенесення витрат або скорочення підписок.`,
          expectedImpact: {
            financial: { amount: Math.abs(deficit.estimatedAmount).toFixed(2), currency: ctx.baseCurrency },
            timeframe: `${daysAhead}d`,
            description: 'Уникнути дефіциту до прогнозованої дати.',
          },
          validForMs: DEFAULT_VALID_FOR_MS,
          generatorMetadata: { source: 'cashflow.deficit.predicted' },
        }),
      );
    }

    // 2. Exceeded budget lines
    for (const budget of ctx.budgets) {
      for (const line of budget.lines) {
        if (line.status !== 'EXCEEDED') continue;
        candidates.push(
          Recommendation.create({
            userId: ctx.userId,
            kind: 'BUDGET',
            generatedBy: 'rules',
            priority: 2,
            payload: {
              reason: 'budget_exceeded',
              budgetId: budget.id,
              lineId: line.lineId,
              categoryId: line.categoryId,
              spentPct: line.spentPct,
            },
            explanation:
              `Категорія в бюджеті "${budget.name}" перевищена на ${Math.max(0, line.spentPct - 100)}% ` +
              `(${line.spentAmount.toFixed(2)} / ${line.plannedAmount.toFixed(2)} ₴). ` +
              `Пропоную перерозподілити з менш критичних envelopes або підвищити плановану суму.`,
            expectedImpact: {
              financial: {
                amount: Math.max(0, line.spentAmount - line.plannedAmount).toFixed(2),
                currency: ctx.baseCurrency,
              },
              timeframe: 'до кінця періоду',
              description: 'Привести категорію в межі плану.',
            },
            validForMs: 7 * 24 * 60 * 60 * 1000,
            generatorMetadata: { source: 'budget.line.exceeded.critical' },
          }),
        );
      }
    }

    // 3. Goals at risk
    for (const goal of ctx.goals) {
      if (goal.feasibilityScore !== null && goal.feasibilityScore < 0.4) {
        candidates.push(
          Recommendation.create({
            userId: ctx.userId,
            kind: 'GOAL',
            generatedBy: 'rules',
            priority: 2,
            payload: {
              reason: 'feasibility_low',
              goalId: goal.id,
              feasibilityScore: goal.feasibilityScore,
              progressPct: goal.progressPct,
              deadline: goal.deadline?.toISOString() ?? null,
            },
            explanation:
              `Ціль "${goal.name}" під ризиком: ймовірність досягнення ${Math.round(goal.feasibilityScore * 100)}%. ` +
              `Варіанти: збільшити щомісячний внесок, відсунути дедлайн, або знизити цільову суму.`,
            expectedImpact: {
              financial: null,
              timeframe: 'до дедлайну',
              description: 'Підняти feasibility до ≥ 70%.',
            },
            validForMs: DEFAULT_VALID_FOR_MS,
            generatorMetadata: { source: 'goal.at-risk' },
          }),
        );
      }
    }

    // 4. Unused subscriptions
    for (const sub of ctx.subscriptions) {
      if (!sub.isEssential && sub.unusedDaysCount !== null && sub.unusedDaysCount >= 30) {
        candidates.push(
          Recommendation.create({
            userId: ctx.userId,
            kind: 'SUBSCRIPTION',
            generatedBy: 'rules',
            priority: 3,
            payload: {
              reason: 'unused_subscription',
              subscriptionId: sub.id,
              merchantName: sub.merchantName,
              unusedDaysCount: sub.unusedDaysCount,
              monthlyAmount: sub.estimatedAmount,
            },
            explanation:
              `Підписка "${sub.merchantName}" неактивна ${sub.unusedDaysCount} днів. ` +
              `Скасування заощадить ~${(sub.estimatedAmount * 12).toFixed(2)} ${ctx.baseCurrency}/рік.`,
            expectedImpact: {
              financial: { amount: (sub.estimatedAmount * 12).toFixed(2), currency: ctx.baseCurrency },
              timeframe: 'річна економія',
              description: 'Скасувати або призупинити підписку.',
            },
            validForMs: 30 * 24 * 60 * 60 * 1000,
            generatorMetadata: { source: 'subscription.unused' },
          }),
        );
      }
    }

    return candidates;
  }
}
