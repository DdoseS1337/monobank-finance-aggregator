export interface BankAccount {
  id: string;
  currencyCode: number;
  balance: number;
  type: string;
}

export interface Transaction {
  id: string;
  source: string;
  externalId: string;
  amount: string;
  operationAmount: string;
  currency: string;
  cashbackAmount: string;
  commissionRate: string;
  balance: string;
  descriptionRaw: string;
  merchantNameClean: string | null;
  mcc: number | null;
  mccCategory: string | null;
  transactionType: 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'HOLD';
  transactionTime: string;
  createdAt: string;
}

export interface SyncRequest {
  source: string;
  token: string;
  accountId: string;
  from: string;
  to: string;
}

export interface SyncResponse {
  synced: number;
}

export interface TransactionFilters {
  from?: string;
  to?: string;
  category?: string;
  /** 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'HOLD' */
  type?: string;
  skip?: number;
  take?: number;
}

export interface CategorySummary {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

export interface DailySummary {
  date: string;
  income: number;
  expense: number;
}

// ── Analytics API types ──────────────────────────────────────────────────────

export interface AnalyticsSummary {
  thisMonthExpense: string;
  lastMonthExpense: string;
  thisMonthIncome: string;
  totalCashback: string;
  topCategory: string | null;
  avgDailySpend: string;
}

export interface MonthlyTrendItem {
  year: number;
  month: number;
  totalExpense: string;
  totalIncome: string;
  net: string;
}

export interface SpendingTrendItem {
  date: string;
  amount: string;
  movingAvg: string;
}

export interface SpendingByCategoryItem {
  category: string;
  total: string;
  count: number;
  percent: string;
}

export interface DayOfWeekItem {
  dayOfWeek: number;
  dayName: string;
  totalAmount: string;
  avgAmount: string;
  count: number;
}

export interface TopCategoryItem {
  rank: number;
  category: string;
  total: string;
  count: number;
  avgAmount: string;
  percent: string;
}

export interface TopMerchantItem {
  merchant: string;
  total: string;
  count: number;
  avgAmount: string;
}

export interface PeriodComparisonItem {
  category: string;
  period1Total: string;
  period2Total: string;
  change: string;
  changePercent: string | null;
}

// ── Patterns API types ──────────────────────────────────────────────────────

export interface RegularPayment {
  merchant: string;
  category: string | null;
  avgAmount: string;
  minAmount: string;
  maxAmount: string;
  avgIntervalDays: number;
  stdIntervalDays: number;
  transactionCount: number;
  firstSeen: string;
  lastSeen: string;
  nextExpectedDate: string | null;
  confidence: number;
}

export interface Subscription {
  merchant: string;
  category: string | null;
  amount: string;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  intervalDays: number;
  firstSeen: string;
  lastSeen: string;
  nextExpectedDate: string | null;
  isActive: boolean;
  transactionCount: number;
  totalSpent: string;
}

export interface RecurringExpense {
  merchant: string;
  category: string | null;
  occurrences: number;
  avgAmount: string;
  totalSpent: string;
  regularityScore: number;
  avgIntervalDays: number;
  lastDate: string;
}

export interface MonthPeriodBehavior {
  period: 'beginning' | 'middle' | 'end';
  periodLabel: string;
  dayRange: string;
  avgSpending: string;
  totalSpending: string;
  transactionCount: number;
  avgTransactionAmount: string;
  topCategories: { category: string; total: string }[];
}

export interface TimeOfDayDistribution {
  slot: 'morning' | 'afternoon' | 'evening' | 'night';
  slotLabel: string;
  hourRange: string;
  totalSpending: string;
  transactionCount: number;
  avgAmount: string;
  percent: string;
}

export interface FinancialHabits {
  weekdayAvgSpend: string;
  weekendAvgSpend: string;
  weekendToWeekdayRatio: string;
  timeOfDay: TimeOfDayDistribution[];
  avgMonthlyIncome: string;
  avgMonthlyExpense: string;
  savingsRate: string;
  avgTransactionsPerDay: string;
  mostActiveDay: string;
  leastActiveDay: string;
  largeTransactionThreshold: string;
  largeTransactionCount: number;
  largeTransactionPercent: string;
  topStableCategories: {
    category: string;
    monthsPresent: number;
    avgMonthlySpend: string;
  }[];
}

// ── Insights API types ─────────────────────────────────────────────────────

export type InsightType =
  | 'anomaly'
  | 'category_spike'
  | 'unusual_purchase'
  | 'conclusion';

export type InsightSeverity = 'info' | 'warning' | 'critical';

export interface Insight {
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  date: string;
  meta: Record<string, unknown>;
}

export interface InsightsResponse {
  insights: Insight[];
  generatedAt: string;
  period: { from: string; to: string };
}

// ── Forecasting API types ──────────────────────────────────────────────────

export type ForecastModel =
  | 'moving_average'
  | 'linear_trend'
  | 'seasonal_naive'
  | 'exponential_smoothing'
  | 'ensemble';

export interface ForecastPoint {
  date: string;
  predicted: string;
  lowerBound: string;
  upperBound: string;
  isPredicted: boolean;
}

export interface CashFlowForecast {
  currentBalance: string;
  history: ForecastPoint[];
  forecast: ForecastPoint[];
  model: ForecastModel;
  accuracyMape: string;
  willRunOut: boolean;
  runOutDate: string | null;
}

export interface EndOfMonthProjection {
  monthStart: string;
  monthEnd: string;
  daysElapsed: number;
  daysRemaining: number;
  actualToDate: string;
  projectedTotal: string;
  projectedRemaining: string;
  pessimistic: string;
  realistic: string;
  optimistic: string;
  spendingPace: string;
  paceStatus: 'under' | 'on_track' | 'over';
}

export interface CategoryForecast {
  category: string;
  avgMonthlySpend: string;
  lastMonthSpend: string;
  projectedThisMonth: string;
  trendPct: string;
  confidence: number;
  monthsOfHistory: number;
}

export interface BurnRate {
  currentBalance: string;
  avgDailyBurn: string;
  avgDailyIncome: string;
  netDailyBurn: string;
  daysUntilEmpty: number | null;
  projectedEmptyDate: string | null;
  sustainable: boolean;
}

export interface ModelComparisonItem {
  model: ForecastModel;
  mape: string;
  residualStd: string;
}

// ── AI Assistant API types ─────────────────────────────────────────────────

export type AiModelId =
  | 'gpt-5'
  | 'gpt-4.1-mini'
  | 'claude-opus-4-7'
  | 'claude-sonnet-4-6';

export interface AiModelMeta {
  id: AiModelId;
  label: string;
  provider: 'openai' | 'anthropic';
  description: string;
}

export interface AiModelsResponse {
  models: AiModelMeta[];
  default: AiModelId;
}

export interface AiThread {
  id: string;
  userId: string;
  title: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface StoredAiMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  parts: Array<{ type: 'text'; text: string } | Record<string, unknown>>;
  createdAt: string;
}

export interface AiThreadWithMessages {
  thread: AiThread;
  messages: StoredAiMessage[];
}
