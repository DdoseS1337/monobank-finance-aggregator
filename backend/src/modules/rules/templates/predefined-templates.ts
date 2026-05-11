import { CreateRuleInput } from '../application/rules.service';

export interface RuleTemplate {
  templateId: string;
  title: string;
  description: string;
  /** Free-form parameters the user fills before the rule is materialized. */
  params: TemplateParam[];
  /** Builds a CreateRuleInput from filled params + userId. */
  build: (userId: string, values: Record<string, unknown>) => CreateRuleInput;
}

export interface TemplateParam {
  key: string;
  label: string;
  kind: 'goalId' | 'envelopeId' | 'percent' | 'amount' | 'currency' | 'mccCode' | 'string';
  required: boolean;
}

const BASE_CURRENCY: 'UAH' = 'UAH';

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    templateId: 'salary-allocate-goal-percent',
    title: 'З кожної зарплати — % у ціль',
    description:
      'Коли надходить дохід (DEBIT) на категорію Зарплата, перенести вказаний % у вибрану ціль.',
    params: [
      { key: 'goalId', label: 'Ціль', kind: 'goalId', required: true },
      { key: 'percent', label: 'Відсоток', kind: 'percent', required: true },
    ],
    build: (userId, v) => ({
      userId,
      name: `${v.percent}% зарплати → ціль`,
      trigger: { kind: 'EVENT', eventType: 'transaction.categorized' },
      condition: {
        op: 'AND',
        left: { op: 'EQ', field: 'transaction.type', value: 'CREDIT' },
        right: { op: 'EQ', field: 'transaction.categorySlug', value: 'investments-investment-income' },
      },
      actions: [
        {
          type: 'ALLOCATE_PERCENT',
          target: { kind: 'GOAL', goalId: v.goalId as string },
          percent: Number(v.percent),
        },
      ],
      priority: 50,
    }),
  },

  {
    templateId: 'large-spend-notify',
    title: 'Сповіщення про велику витрату',
    description: 'Коли разова витрата перевищує поріг — надсилати in-app повідомлення.',
    params: [
      { key: 'threshold', label: 'Поріг (₴)', kind: 'amount', required: true },
    ],
    build: (userId, v) => ({
      userId,
      name: `Велика витрата (>${v.threshold} ₴)`,
      trigger: { kind: 'EVENT', eventType: 'transaction.categorized' },
      condition: {
        op: 'AND',
        left: { op: 'EQ', field: 'transaction.type', value: 'DEBIT' },
        right: { op: 'GT', field: 'transaction.amount', value: Number(v.threshold) },
      },
      actions: [
        {
          type: 'NOTIFY',
          channel: 'in_app',
          template: 'large-spend',
          params: { threshold: v.threshold },
        },
      ],
      priority: 100,
      cooldownSeconds: 60,
    }),
  },

  {
    templateId: 'budget-warning-notify',
    title: 'Попередження про бюджет',
    description: 'Коли категорія бюджету проходить поріг попередження — сповістити користувача.',
    params: [],
    build: (userId) => ({
      userId,
      name: 'Попередження по бюджету',
      trigger: { kind: 'EVENT', eventType: 'budget.line.exceeded.warning' },
      actions: [
        { type: 'NOTIFY', channel: 'in_app', template: 'budget-warning' },
      ],
      priority: 30,
    }),
  },

  {
    templateId: 'budget-critical-recommend',
    title: 'Рекомендація при перевищенні',
    description:
      'Коли категорія бюджету перевищена — створити рекомендацію (буде показана в Inbox).',
    params: [],
    build: (userId) => ({
      userId,
      name: 'Рекомендація при перевищенні',
      trigger: { kind: 'EVENT', eventType: 'budget.line.exceeded.critical' },
      actions: [
        {
          type: 'CREATE_RECOMMENDATION',
          kind: 'BUDGET',
          payload: { reason: 'budget_exceeded' },
        },
      ],
      priority: 20,
    }),
  },

  {
    templateId: 'goal-at-risk-recommend',
    title: 'Рекомендація для цілі під ризиком',
    description: 'Коли feasibility цілі падає нижче порогу — згенерувати рекомендацію.',
    params: [],
    build: (userId) => ({
      userId,
      name: 'Рекомендація для цілі під ризиком',
      trigger: { kind: 'EVENT', eventType: 'goal.at-risk' },
      actions: [
        {
          type: 'CREATE_RECOMMENDATION',
          kind: 'GOAL',
          payload: { reason: 'feasibility_low' },
        },
      ],
      priority: 25,
    }),
  },

  {
    templateId: 'fastfood-monthly-cap',
    title: 'Сповіщення при витратах на фастфуд',
    description:
      'Кожна транзакція в категорії Food/Fast Food → in-app нагадування з сумою.',
    params: [],
    build: (userId) => ({
      userId,
      name: 'Контроль фастфуду',
      trigger: { kind: 'EVENT', eventType: 'transaction.categorized' },
      condition: {
        op: 'AND',
        left: { op: 'EQ', field: 'transaction.type', value: 'DEBIT' },
        right: {
          op: 'EQ',
          field: 'transaction.categorySlug',
          value: 'food--fast-food',
        },
      },
      actions: [
        { type: 'NOTIFY', channel: 'in_app', template: 'fastfood-spend' },
      ],
      priority: 200,
      cooldownSeconds: 3600,
    }),
  },

  {
    templateId: 'salary-fixed-goal',
    title: 'З кожної зарплати — фіксована сума у ціль',
    description: 'Перенести вказану фіксовану суму у ціль при кожному CREDIT.',
    params: [
      { key: 'goalId', label: 'Ціль', kind: 'goalId', required: true },
      { key: 'amount', label: 'Сума', kind: 'amount', required: true },
    ],
    build: (userId, v) => ({
      userId,
      name: `Фікс. ${v.amount} ${BASE_CURRENCY} → ціль`,
      trigger: { kind: 'EVENT', eventType: 'transaction.categorized' },
      condition: { op: 'EQ', field: 'transaction.type', value: 'CREDIT' },
      actions: [
        {
          type: 'ALLOCATE_FIXED',
          target: { kind: 'GOAL', goalId: v.goalId as string },
          amount: String(v.amount),
          currency: BASE_CURRENCY,
        },
      ],
      priority: 60,
    }),
  },

  {
    templateId: 'subscription-detected-notify',
    title: 'Сповіщення про нову підписку',
    description: 'Коли система виявляє нову підписку — повідомити в Inbox.',
    params: [],
    build: (userId) => ({
      userId,
      name: 'Нова підписка виявлена',
      trigger: { kind: 'EVENT', eventType: 'subscription.detected' },
      actions: [
        { type: 'NOTIFY', channel: 'in_app', template: 'subscription-detected' },
      ],
      priority: 40,
    }),
  },

  {
    templateId: 'evening-spend-warn',
    title: 'Попередження про вечірні витрати',
    description: 'Витрата DEBIT між 22:00 і 02:00 → м’яке нагадування.',
    params: [],
    build: (userId) => ({
      userId,
      name: 'Контроль вечірніх витрат',
      trigger: { kind: 'EVENT', eventType: 'transaction.categorized' },
      condition: {
        op: 'AND',
        left: { op: 'EQ', field: 'transaction.type', value: 'DEBIT' },
        right: {
          op: 'OR',
          left: { op: 'GTE', field: 'time.hourOfDay', value: 22 },
          right: { op: 'LTE', field: 'time.hourOfDay', value: 2 },
        },
      },
      actions: [
        { type: 'NOTIFY', channel: 'in_app', template: 'evening-spend' },
      ],
      priority: 250,
      cooldownSeconds: 7200,
    }),
  },

  {
    templateId: 'cashflow-deficit-recommend',
    title: 'Рекомендація при прогнозі дефіциту',
    description:
      'Коли модель прогнозує дефіцит коштів у горизонті — згенерувати proactive рекомендацію.',
    params: [],
    build: (userId) => ({
      userId,
      name: 'Прогноз дефіциту → рекомендація',
      trigger: { kind: 'EVENT', eventType: 'cashflow.deficit.predicted' },
      actions: [
        {
          type: 'CREATE_RECOMMENDATION',
          kind: 'CASHFLOW',
          payload: { reason: 'predicted_deficit' },
        },
      ],
      priority: 10,
    }),
  },
];

export function findTemplate(templateId: string): RuleTemplate | undefined {
  return RULE_TEMPLATES.find((t) => t.templateId === templateId);
}
