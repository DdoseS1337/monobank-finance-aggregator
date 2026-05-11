// ─────────────────────────────────────────────────────────────────────────────
// Domain types mirroring the PFOS backend response shapes.
// Hand-written for now; if/when we add an OpenAPI spec we can codegen this.
// ─────────────────────────────────────────────────────────────────────────────

// Money

export type Currency = 'UAH' | 'USD' | 'EUR' | 'GBP' | 'PLN';

// Accounts

export type AccountType =
  | 'CHECKING'
  | 'SAVINGS'
  | 'CREDIT'
  | 'CASH'
  | 'VIRTUAL';

export interface AccountSummary {
  id: string;
  provider: string;
  name: string;
  currency: Currency;
  balance: string;
  type: AccountType;
  linkedAt: string;
}

export interface MonobankLinkResult {
  linked: number;
  accounts: Array<{
    id: string;
    name: string;
    currency: Currency;
    balance: string;
    type: AccountType;
  }>;
}

// Transactions

export type TransactionType = 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'HOLD';

export interface TransactionDto {
  id: string;
  accountId: string;
  amount: string;
  currency: Currency;
  type: TransactionType;
  status: 'PENDING' | 'POSTED' | 'REVERSED';
  description: string | null;
  merchantName: string | null;
  mccCode: number | null;
  categoryId: string | null;
  isRecurring: boolean;
  isAnomaly: boolean;
  anomalyScore: number | null;
  transactionDate: string;
  importedAt: string;
}

export interface TransactionPage {
  items: TransactionDto[];
  nextCursor: string | null;
}

export interface SpendingCategorySlice {
  categoryId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  amount: string;
  pct: number;
  txCount: number;
}

export interface SpendingDecompositionItemDto {
  key: string;
  label: string;
  spendA: number;
  spendB: number;
  countA: number;
  countB: number;
  avgTicketA: number;
  avgTicketB: number;
  delta: number;
  priceEffect: number;
  volumeEffect: number;
  crossEffect: number;
  status: 'BOTH' | 'NEW' | 'DROPPED';
}

export interface SpendingDecompositionDto {
  currency: string;
  periodA: { from: string; to: string; spend: number; txCount: number };
  periodB: { from: string; to: string; spend: number; txCount: number };
  totals: {
    delta: number;
    deltaPct: number;
    priceEffect: number;
    volumeEffect: number;
    mixInEffect: number;
    mixOutEffect: number;
    crossEffect: number;
  };
  groupBy: 'merchant' | 'category';
  items: SpendingDecompositionItemDto[];
}

export interface SpendingSummaryDto {
  from: string;
  to: string;
  currency: string;
  total: string;
  txCount: number;
  byCategory: SpendingCategorySlice[];
}

// Budgets

export type BudgetMethod =
  | 'CATEGORY'
  | 'ENVELOPE'
  | 'ZERO_BASED'
  | 'PAY_YOURSELF_FIRST';

export type Cadence = 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export type BudgetLineStatus = 'OK' | 'WARNING' | 'EXCEEDED';

export interface BudgetLineDto {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  plannedAmount: string;
  spentAmount: string;
  spentPct: number;
  thresholdPct: number;
  status: BudgetLineStatus;
}

export interface BudgetPeriodDto {
  id: string;
  start: string;
  end: string;
  status: string;
  totalPlanned: string | null;
  totalSpent: string | null;
  lines: BudgetLineDto[];
}

export interface BudgetDto {
  id: string;
  name: string;
  method: BudgetMethod;
  cadence: Cadence;
  baseCurrency: Currency;
  rolloverPolicy: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  currentPeriod: BudgetPeriodDto | null;
  health: {
    status: 'GREEN' | 'YELLOW' | 'RED';
    atRiskLines: number;
    exceededLines: number;
    totalLines: number;
  };
}

// Goals

export type GoalType = 'SAVING' | 'DEBT_PAYOFF' | 'INVESTMENT' | 'PURCHASE';
export type GoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';
export type FundingStrategy = 'FIXED_MONTHLY' | 'PERCENTAGE_INCOME' | 'SURPLUS';
export type FeasibilityCategory =
  | 'AT_RISK'
  | 'TIGHT'
  | 'COMFORTABLE'
  | 'AHEAD'
  | 'UNKNOWN';

export interface GoalDto {
  id: string;
  type: GoalType;
  name: string;
  description: string | null;
  targetAmount: string;
  currentAmount: string;
  baseCurrency: Currency;
  remaining: string;
  pct: number;
  deadline: string | null;
  priority: number;
  fundingStrategy: FundingStrategy;
  fundingParams: Record<string, unknown>;
  linkedAccountId: string | null;
  status: GoalStatus;
  feasibility: {
    score: number | null;
    category: FeasibilityCategory;
    monthsAvailable: number | null;
    requiredMonthlyContribution: string | null;
    averageMonthlyContribution: number;
  };
  milestones: Array<{ thresholdPct: number; reachedAt: string | null }>;
  contributionsCount: number;
}

// Cashflow

export interface ProjectionPointDto {
  day: string;
  balanceP10: string;
  balanceP50: string;
  balanceP90: string;
  expectedInflow: string;
  expectedOutflow: string;
  hasDeficitRisk: boolean;
}

export interface DeficitWindowDto {
  start: string;
  end: string;
  worstDay: string;
  worstAmount: number;
  confidence: number;
}

export interface CashflowProjectionDto {
  id: string;
  horizonDays: number;
  generatedAt: string;
  modelVersion: string;
  confidenceScore: number | null;
  isLatest: boolean;
  points: ProjectionPointDto[];
  assumptions: Array<{ key: string; value: unknown; source: string }>;
  deficitWindows: DeficitWindowDto[];
}

// Scenarios

export type ScenarioVariable =
  | { kind: 'INCOME_DELTA'; deltaMonthly: number; reason?: string }
  | { kind: 'CATEGORY_DELTA'; categorySlug: string; deltaPct: number }
  | {
      kind: 'NEW_GOAL';
      targetAmount: number;
      deadline: string;
      monthlyContribution: number;
      name: string;
    }
  | {
      kind: 'NEW_RECURRING';
      amountMonthly: number;
      sign: 'INFLOW' | 'OUTFLOW';
      description: string;
    };

export interface ScenarioOutcomeDto {
  metricKey: string;
  baseline: number;
  modified: number;
  delta: number;
  deltaPct: number;
}

export interface ScenarioDto {
  id: string;
  name: string;
  baselineProjectionId: string | null;
  variables: ScenarioVariable[];
  outcomes: ScenarioOutcomeDto[] | null;
  computedAt: string | null;
}

// Recommendations

export type RecommendationKind =
  | 'SPENDING'
  | 'SAVING'
  | 'SUBSCRIPTION'
  | 'BUDGET'
  | 'GOAL'
  | 'CASHFLOW'
  | 'BEHAVIORAL';

export type RecommendationStatus =
  | 'PENDING'
  | 'DELIVERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'MODIFIED'
  | 'SNOOZED'
  | 'EXPIRED';

export interface RecommendationDto {
  id: string;
  kind: RecommendationKind;
  priority: number;
  generatedBy: 'rules' | 'ml' | 'llm' | 'hybrid';
  generatedAt: string;
  validUntil: string | null;
  status: RecommendationStatus;
  explanation: string;
  payload: Record<string, unknown>;
  expectedImpact: {
    financial: { amount: string; currency: string } | null;
    timeframe: string | null;
    description: string;
  } | null;
  ranking: {
    total: number;
    breakdown: { utility: number; urgency: number; novelty: number; userFit: number };
    weights: { utility: number; urgency: number; novelty: number; userFit: number };
  } | null;
  actions: unknown[];
  deliveredAt: string | null;
}

// Notifications

export interface NotificationDto {
  id: string;
  channel: 'in_app' | 'email' | 'push' | 'telegram';
  kind: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  payload: Record<string, unknown>;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  scheduledFor: string;
  retryCount: number;
}

// Personalization

export interface UserProfileDto {
  riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  financialLiteracyLevel: 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT';
  preferredTone: 'FORMAL' | 'FRIENDLY' | 'DIRECT';
  preferredChannels: Array<'in_app' | 'email' | 'push' | 'telegram'>;
  preferredLanguage: 'uk' | 'en';
  quietHours: { from: string; to: string } | null;
  behavioralTraits: {
    eveningSpenderScore: number;
    weekendSpenderScore: number;
    impulsivityScore: number;
    plannerScore: number;
    segment: string | null;
    observations: number;
    computedAt: string | null;
  };
}

// Rules

export interface RuleDto {
  id: string;
  name: string;
  description: string | null;
  trigger: unknown;
  condition: unknown;
  actions: unknown;
  priority: number;
  cooldownSeconds: number;
  enabled: boolean;
  lastExecutedAt: string | null;
  executionCount: number;
}

export interface RuleTemplateDto {
  templateId: string;
  title: string;
  description: string;
  params: Array<{
    key: string;
    label: string;
    kind:
      | 'goalId'
      | 'envelopeId'
      | 'percent'
      | 'amount'
      | 'currency'
      | 'mccCode'
      | 'string';
    required: boolean;
  }>;
}

// AI

export interface ChatResponseDto {
  sessionId: string;
  agent: 'analyst' | 'planner' | 'forecaster' | 'guardrail-blocked';
  rationale: string;
  text: string;
  pendingConfirmations: Array<{
    stagedActionId: string;
    preview: Record<string, unknown>;
    toolName: string;
  }>;
  toolCalls: Array<{ name: string; ok: boolean }>;
  flags: string[];
  costUsd: number;
  verification?: {
    total: number;
    verified: number;
    unverified: number;
    hallucinationRate: number;
    retried: boolean;
    unverifiedClaims: string[];
  };
}

export interface KnowledgeArticleDto {
  id: string;
  title: string;
  section: string | null;
  source: string;
  content: string;
  lang: string;
  version: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
  parentSlug: string | null;
  isSystem: boolean;
}

export interface FxRateDto {
  base: string;
  quote: string;
  rate: number;
  asOf: string;
}

export interface FxConvertDto {
  from: string;
  to: string;
  amountIn: number;
  amountOut: number;
  rate: number;
  asOf: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  startedAt: string;
  lastTurnAt: string | null;
  turnCount: number;
  status: string;
}

export interface ChatTurnDto {
  id: string;
  turnNumber: number;
  role: 'USER' | 'ASSISTANT' | 'TOOL' | 'SYSTEM';
  content: string | null;
  toolCalls: unknown;
  createdAt: string;
}

export interface ChatSessionTranscript {
  id: string;
  startedAt: string;
  status: string;
  turns: ChatTurnDto[];
}

export interface StagedActionDto {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  preview: Record<string, unknown>;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';
  initiatedAt: string;
  expiresAt: string;
}
