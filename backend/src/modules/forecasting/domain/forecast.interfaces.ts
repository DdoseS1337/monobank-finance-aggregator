// ── Model identifiers used across the module ──────────────────────────────
export type ForecastModel =
  | 'moving_average'      // ковзке середнє (baseline)
  | 'linear_trend'        // лінійна регресія (тренд)
  | 'seasonal_naive'      // той самий день тижня/тиждень місяця з історії
  | 'exponential_smoothing' // Holt's method (level + trend)
  | 'ensemble';           // середнє з усіх моделей

// ── Single forecast point ──────────────────────────────────────────────────
export interface ForecastPoint {
  date: string;
  predicted: string;
  lowerBound: string;  // lower 80% confidence
  upperBound: string;  // upper 80% confidence
  /** Whether this point is historical (actual) or predicted */
  isPredicted: boolean;
}

// ── Cash-flow forecast (balance trajectory) ───────────────────────────────
export interface CashFlowForecast {
  currentBalance: string;
  history: ForecastPoint[];
  forecast: ForecastPoint[];
  model: ForecastModel;
  /** MAPE — mean absolute percentage error of the model on historical data */
  accuracyMape: string;
  /** Will the balance drop below zero in the horizon? */
  willRunOut: boolean;
  runOutDate: string | null;
}

// ── End-of-month projection ───────────────────────────────────────────────
export interface EndOfMonthProjection {
  monthStart: string;
  monthEnd: string;
  daysElapsed: number;
  daysRemaining: number;

  actualToDate: string;
  projectedTotal: string;
  projectedRemaining: string;

  pessimistic: string;   // upper bound
  realistic: string;     // mean
  optimistic: string;    // lower bound

  /** Pace ratio: actualToDate / (daysElapsed × avgDaily) */
  spendingPace: string;
  paceStatus: 'under' | 'on_track' | 'over';
}

// ── Per-category forecast ─────────────────────────────────────────────────
export interface CategoryForecast {
  category: string;
  avgMonthlySpend: string;
  lastMonthSpend: string;
  projectedThisMonth: string;
  trendPct: string;     // growth trend %/month
  confidence: number;    // 0..1 based on history length and variance
  monthsOfHistory: number;
}

// ── Burn rate ──────────────────────────────────────────────────────────────
export interface BurnRate {
  currentBalance: string;
  avgDailyBurn: string;
  avgDailyIncome: string;
  netDailyBurn: string;
  daysUntilEmpty: number | null;
  projectedEmptyDate: string | null;
  sustainable: boolean;
}

// ── Raw series points from DB ──────────────────────────────────────────────
export interface DailySeriesPoint {
  date: Date;
  expense: number;
  income: number;
}
