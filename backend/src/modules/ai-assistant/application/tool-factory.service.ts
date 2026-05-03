import { Injectable } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { AnalyticsQueryService } from '../../analytics/application/analytics-query.service';
import { PatternsService } from '../../patterns/application/patterns.service';
import { InsightsService } from '../../insights/application/insights.service';
import { ForecastingService } from '../../forecasting/application/forecasting.service';
import { TransactionRepository } from '../../transactions/infrastructure/repositories/transaction.repository';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Expand a date-only string into an inclusive day boundary:
 *   "2026-04-16" as `from` → 2026-04-16T00:00:00.000
 *   "2026-04-16" as `to`   → 2026-04-16T23:59:59.999
 * Strings that already contain a time are passed through.
 */
function expandDate(value: string | undefined, side: 'from' | 'to'): string | undefined {
  if (!value) return undefined;
  if (!DATE_ONLY_RE.test(value)) return value;
  return side === 'from' ? `${value}T00:00:00.000` : `${value}T23:59:59.999`;
}

function parseDate(value: string | undefined, side: 'from' | 'to'): Date | undefined {
  const v = expandDate(value, side);
  return v ? new Date(v) : undefined;
}

/**
 * Builds the tools manifest for the AI assistant.
 *
 * Each tool wraps an existing service call. The LLM sees the description
 * + input schema, picks a tool, gets back JSON data, then composes the
 * final natural-language answer. Numbers never leave the database —
 * eliminates hallucinated figures.
 */
@Injectable()
export class ToolFactoryService {
  constructor(
    private readonly analytics: AnalyticsQueryService,
    private readonly patterns: PatternsService,
    private readonly insights: InsightsService,
    private readonly forecasting: ForecastingService,
    private readonly transactionRepo: TransactionRepository,
  ) {}

  forUser(userId: string) {
    return {
      search_transactions: tool({
        description:
          'Повнотекстовий пошук по мерчантах та описах транзакцій. Використовуй коли користувач питає про конкретний мерчант, магазин або тип покупки.',
        inputSchema: z.object({
          query: z.string().describe('Текст для пошуку (напр. "Starbucks", "Netflix", "таксі")'),
          from: z.string().optional().describe('ISO дата початку періоду (опціонально)'),
          to: z.string().optional().describe('ISO дата кінця періоду (опціонально)'),
        }),
        execute: async ({ query, from, to }) => {
          const rows = await this.transactionRepo.searchByText(
            userId,
            query,
            parseDate(from, 'from'),
            parseDate(to, 'to'),
            25,
          );
          return rows.map((t) => ({
            date: t.transactionTime.toISOString().slice(0, 10),
            merchant: t.merchantNameClean ?? t.descriptionRaw,
            amount: t.amount.toString(),
            category: t.mccCategory,
            currency: t.currency,
            type: t.transactionType,
          }));
        },
      }),

      get_spending_by_category: tool({
        description:
          'Витрати згруповані за категоріями за період. Використовуй для питань типу "на що я найбільше витрачаю", "скільки на їжу", "структура витрат".',
        inputSchema: z.object({
          from: z.string().optional().describe('ISO дата початку (дефолт: 30 днів тому)'),
          to: z.string().optional().describe('ISO дата кінця (дефолт: сьогодні)'),
        }),
        execute: async ({ from, to }) =>
          this.analytics.spendingByCategory(userId, {
            from: expandDate(from, 'from'),
            to: expandDate(to, 'to'),
          }),
      }),

      get_top_merchants: tool({
        description: 'Топ мерчантів за обсягом витрат. Використовуй для "де я витрачаю найбільше".',
        inputSchema: z.object({
          from: z.string().optional(),
          to: z.string().optional(),
          limit: z.number().int().min(1).max(25).optional().describe('Скільки мерчантів повернути (дефолт 10)'),
        }),
        execute: async ({ from, to, limit }) =>
          this.analytics.topMerchants(userId, {
            from: expandDate(from, 'from'),
            to: expandDate(to, 'to'),
            limit,
          }),
      }),

      get_monthly_trend: tool({
        description:
          'Витрати й доходи за місяцями (historical). Використовуй для питань "чи більше я витратив цього місяця", "тренд витрат".',
        inputSchema: z.object({
          from: z.string().optional(),
          to: z.string().optional(),
        }),
        execute: async ({ from, to }) =>
          this.analytics.monthlyTrend(userId, {
            from: expandDate(from, 'from'),
            to: expandDate(to, 'to'),
          }),
      }),

      get_period_comparison: tool({
        description:
          'Порівнює витрати за двома періодами за категоріями. Використовуй коли треба пояснити ЧОМУ витрати змінились.',
        inputSchema: z.object({
          period1From: z.string().describe('ISO дата — початок першого періоду'),
          period1To: z.string().describe('ISO дата — кінець першого періоду'),
          period2From: z.string().describe('ISO дата — початок другого періоду (зазвичай новіший)'),
          period2To: z.string().describe('ISO дата — кінець другого періоду'),
        }),
        execute: async ({ period1From, period1To, period2From, period2To }) =>
          this.analytics.periodComparison(userId, {
            period1From: expandDate(period1From, 'from')!,
            period1To: expandDate(period1To, 'to')!,
            period2From: expandDate(period2From, 'from')!,
            period2To: expandDate(period2To, 'to')!,
          }),
      }),

      get_summary: tool({
        description:
          'Зведення за поточний місяць: витрати, доходи, кешбек, топ категорія, середні денні витрати. Використовуй для загальних питань "як у мене з грошима".',
        inputSchema: z.object({}),
        execute: async () => this.analytics.summary(userId),
      }),

      get_income_summary: tool({
        description:
          'Детальна інформація про ДОХОДИ за довільний період: сума, кількість надходжень, середнє, топ джерела (з описом), розбивка по місяцях. Використовуй для питань "скільки я заробив", "звідки мої доходи", "заробіток цього року".',
        inputSchema: z.object({
          from: z.string().optional().describe('ISO дата початку (якщо не вказано — уся історія)'),
          to: z.string().optional().describe('ISO дата кінця'),
        }),
        execute: async ({ from, to }) =>
          this.analytics.incomeSummary(userId, {
            from: expandDate(from, 'from'),
            to: expandDate(to, 'to'),
          }),
      }),

      get_subscriptions: tool({
        description:
          'Список підписок (регулярних платежів зі стабільною сумою). Використовуй для "які підписки у мене є".',
        inputSchema: z.object({}),
        execute: async () => this.patterns.subscriptions(userId, {}),
      }),

      get_recurring_expenses: tool({
        description:
          'Повторювані витрати — мерчанти з множинними транзакціями. Ширше ніж subscriptions.',
        inputSchema: z.object({}),
        execute: async () => this.patterns.recurringExpenses(userId, {}),
      }),

      get_financial_habits: tool({
        description:
          'Агреговані фінансові звички: витрати будні vs вихідні, час доби, savings rate, стабільні категорії, великі покупки.',
        inputSchema: z.object({}),
        execute: async () => this.patterns.financialHabits(userId, {}),
      }),

      get_insights: tool({
        description:
          'Автоматично виявлені інсайти: аномалії, стрибки категорій, нетипові покупки, висновки. Використовуй для "щось дивне", "аномалії", "чому так вийшло".',
        inputSchema: z.object({}),
        execute: async () => this.insights.all(userId, {}),
      }),

      get_end_of_month_projection: tool({
        description:
          'Прогноз витрат до кінця поточного місяця з песимістичним/реалістичним/оптимістичним сценаріями.',
        inputSchema: z.object({}),
        execute: async () => this.forecasting.endOfMonth(userId, {}),
      }),

      get_category_forecast: tool({
        description:
          'Прогноз витрат по кожній категорії на поточний місяць з трендом.',
        inputSchema: z.object({}),
        execute: async () => this.forecasting.byCategory(userId, {}),
      }),

      get_burn_rate: tool({
        description:
          'Burn rate — скільки днів витримає баланс при поточному темпі витрат.',
        inputSchema: z.object({}),
        execute: async () => this.forecasting.burnRate(userId, {}),
      }),
    };
  }
}
