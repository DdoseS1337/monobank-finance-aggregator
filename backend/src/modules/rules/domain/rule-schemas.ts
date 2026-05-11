import { z } from 'zod';

// ========================================================================
// CONDITION AST — boolean expressions evaluated against an event context
// ========================================================================

const COMPARABLE_FIELDS = [
  // Transaction-related
  'transaction.amount',
  'transaction.mccCode',
  'transaction.categorySlug',
  'transaction.merchantName',
  'transaction.type',
  'transaction.description',
  // Time
  'time.dayOfWeek',
  'time.hourOfDay',
  // Budget-related
  'budget.spentPct',
  'budget.spentAmount',
  // Goal-related
  'goal.feasibilityScore',
  'goal.progressPct',
  'goal.priority',
] as const;

export type ConditionField = (typeof COMPARABLE_FIELDS)[number];

const ConditionPrimitive = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export type ConditionASTNode =
  | { op: 'AND'; left: ConditionASTNode; right: ConditionASTNode }
  | { op: 'OR'; left: ConditionASTNode; right: ConditionASTNode }
  | { op: 'NOT'; expr: ConditionASTNode }
  | { op: 'EQ'; field: ConditionField; value: string | number | boolean | null }
  | { op: 'NEQ'; field: ConditionField; value: string | number | boolean | null }
  | { op: 'GT'; field: ConditionField; value: number }
  | { op: 'GTE'; field: ConditionField; value: number }
  | { op: 'LT'; field: ConditionField; value: number }
  | { op: 'LTE'; field: ConditionField; value: number }
  | { op: 'IN'; field: ConditionField; values: Array<string | number> }
  | { op: 'CONTAINS'; field: ConditionField; substring: string };

const FieldEnum = z.enum(COMPARABLE_FIELDS);

const baseSchemas: {
  EQ: z.ZodTypeAny;
  NEQ: z.ZodTypeAny;
  GT: z.ZodTypeAny;
  GTE: z.ZodTypeAny;
  LT: z.ZodTypeAny;
  LTE: z.ZodTypeAny;
  IN: z.ZodTypeAny;
  CONTAINS: z.ZodTypeAny;
} = {
  EQ: z.object({ op: z.literal('EQ'), field: FieldEnum, value: ConditionPrimitive }),
  NEQ: z.object({ op: z.literal('NEQ'), field: FieldEnum, value: ConditionPrimitive }),
  GT: z.object({ op: z.literal('GT'), field: FieldEnum, value: z.number() }),
  GTE: z.object({ op: z.literal('GTE'), field: FieldEnum, value: z.number() }),
  LT: z.object({ op: z.literal('LT'), field: FieldEnum, value: z.number() }),
  LTE: z.object({ op: z.literal('LTE'), field: FieldEnum, value: z.number() }),
  IN: z.object({
    op: z.literal('IN'),
    field: FieldEnum,
    values: z.array(z.union([z.string(), z.number()])).min(1).max(100),
  }),
  CONTAINS: z.object({
    op: z.literal('CONTAINS'),
    field: FieldEnum,
    substring: z.string().min(1).max(255),
  }),
};

export const ConditionASTSchema: z.ZodType<ConditionASTNode> = z.lazy(() =>
  z.union([
    z.object({
      op: z.literal('AND'),
      left: ConditionASTSchema,
      right: ConditionASTSchema,
    }),
    z.object({
      op: z.literal('OR'),
      left: ConditionASTSchema,
      right: ConditionASTSchema,
    }),
    z.object({ op: z.literal('NOT'), expr: ConditionASTSchema }),
    baseSchemas.EQ,
    baseSchemas.NEQ,
    baseSchemas.GT,
    baseSchemas.GTE,
    baseSchemas.LT,
    baseSchemas.LTE,
    baseSchemas.IN,
    baseSchemas.CONTAINS,
  ]),
) as z.ZodType<ConditionASTNode>;

// ========================================================================
// TRIGGER SPEC — what causes the rule to be evaluated
// ========================================================================

export type TriggerSpec =
  | { kind: 'EVENT'; eventType: string }
  | { kind: 'SCHEDULE'; cron: string }
  | { kind: 'THRESHOLD'; metric: string };

export const TriggerSpecSchema: z.ZodType<TriggerSpec> = z.union([
  z.object({ kind: z.literal('EVENT'), eventType: z.string().min(1).max(100) }),
  z.object({ kind: z.literal('SCHEDULE'), cron: z.string().min(1).max(100) }),
  z.object({ kind: z.literal('THRESHOLD'), metric: z.string().min(1).max(100) }),
]);

// ========================================================================
// ACTION SPEC — what to do when the condition matches
// ========================================================================

export type ActionTargetRef =
  | { kind: 'GOAL'; goalId: string }
  | { kind: 'ENVELOPE'; envelopeId: string }
  | { kind: 'BUDGET_LINE'; budgetId: string; lineId: string };

const TargetRef: z.ZodType<ActionTargetRef> = z.union([
  z.object({ kind: z.literal('GOAL'), goalId: z.string().uuid() }),
  z.object({ kind: z.literal('ENVELOPE'), envelopeId: z.string().uuid() }),
  z.object({
    kind: z.literal('BUDGET_LINE'),
    budgetId: z.string().uuid(),
    lineId: z.string().uuid(),
  }),
]);

export type ActionSpec =
  | { type: 'ALLOCATE_PERCENT'; target: ActionTargetRef; percent: number; sourceField?: string }
  | { type: 'ALLOCATE_FIXED'; target: ActionTargetRef; amount: string; currency: string }
  | {
      type: 'TRANSFER';
      from: { kind: 'ENVELOPE'; envelopeId: string };
      to: { kind: 'ENVELOPE'; envelopeId: string };
      amount: string;
      currency: string;
    }
  | { type: 'NOTIFY'; channel: 'in_app' | 'email' | 'push' | 'telegram'; template: string; params?: Record<string, unknown> }
  | { type: 'CREATE_RECOMMENDATION'; kind: string; payload: Record<string, unknown> };

export const ActionSpecSchema: z.ZodType<ActionSpec> = z.union([
  z.object({
    type: z.literal('ALLOCATE_PERCENT'),
    target: TargetRef,
    percent: z.number().positive().max(100),
    sourceField: z.string().optional(),
  }),
  z.object({
    type: z.literal('ALLOCATE_FIXED'),
    target: TargetRef,
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.string().length(3),
  }),
  z.object({
    type: z.literal('TRANSFER'),
    from: z.object({ kind: z.literal('ENVELOPE'), envelopeId: z.string().uuid() }),
    to: z.object({ kind: z.literal('ENVELOPE'), envelopeId: z.string().uuid() }),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.string().length(3),
  }),
  z.object({
    type: z.literal('NOTIFY'),
    channel: z.enum(['in_app', 'email', 'push', 'telegram']),
    template: z.string().min(1).max(100),
    params: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('CREATE_RECOMMENDATION'),
    kind: z.string().min(1).max(50),
    payload: z.record(z.unknown()),
  }),
]);

export const ActionsArraySchema = z.array(ActionSpecSchema).min(1).max(10);

// ========================================================================
// EVENT CONTEXT — input to the AST evaluator
// ========================================================================

export interface EvaluationContext {
  transaction?: {
    amount: number;
    mccCode: number | null;
    categorySlug: string | null;
    merchantName: string | null;
    type: string;
    description: string | null;
  };
  budget?: {
    spentPct: number;
    spentAmount: number;
  };
  goal?: {
    feasibilityScore: number | null;
    progressPct: number;
    priority: number;
  };
  time: {
    dayOfWeek: number; // 0 = Sun … 6 = Sat
    hourOfDay: number; // 0..23
  };
}
