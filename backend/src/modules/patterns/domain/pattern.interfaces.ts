// ── Regular payment detected from transaction history ──────────────────────
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
  confidence: number; // 0-1
}

// ── Subscription (regular + stable amount + monthly-ish) ───────────────────
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

// ── Recurring expense group ────────────────────────────────────────────────
export interface RecurringExpense {
  merchant: string;
  category: string | null;
  occurrences: number;
  avgAmount: string;
  totalSpent: string;
  regularityScore: number; // 0-1, how regular the intervals are
  avgIntervalDays: number;
  lastDate: string;
}

// ── Spending behaviour within different parts of the month ─────────────────
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

// ── Time-of-day spending distribution ──────────────────────────────────────
export interface TimeOfDayDistribution {
  slot: 'morning' | 'afternoon' | 'evening' | 'night';
  slotLabel: string;
  hourRange: string;
  totalSpending: string;
  transactionCount: number;
  avgAmount: string;
  percent: string;
}

// ── Aggregated financial habits ────────────────────────────────────────────
export interface FinancialHabits {
  // spending rhythm
  weekdayAvgSpend: string;
  weekendAvgSpend: string;
  weekendToWeekdayRatio: string;

  // time distribution
  timeOfDay: TimeOfDayDistribution[];

  // savings
  avgMonthlyIncome: string;
  avgMonthlyExpense: string;
  savingsRate: string; // percentage

  // consistency
  avgTransactionsPerDay: string;
  mostActiveDay: string;
  leastActiveDay: string;

  // large purchases
  largeTransactionThreshold: string;
  largeTransactionCount: number;
  largeTransactionPercent: string;

  // category loyalty — how stable spending pattern is month-to-month
  topStableCategories: { category: string; monthsPresent: number; avgMonthlySpend: string }[];
}
