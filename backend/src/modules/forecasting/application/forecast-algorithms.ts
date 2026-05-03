/**
 * Pure TypeScript forecasting algorithms.
 *
 * Each function takes a numeric series (daily values, oldest → newest)
 * and a horizon, returning the forecast plus 80% confidence intervals
 * derived from in-sample residual variance.
 *
 * No external ML libraries — everything is hand-rolled so the math is
 * fully transparent for the diploma defense.
 */

export interface ForecastResult {
  predicted: number[];
  lower: number[];
  upper: number[];
  /** Mean Absolute Percentage Error on historical data (0..∞) */
  mape: number;
  /** Residual standard deviation (used for CI) */
  residualStd: number;
}

/* ───────────────────────────────────────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────────────────────────────────────── */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** z = 1.28 corresponds to 80% two-sided CI */
const Z_80 = 1.28;

function confidenceBands(
  predicted: number[],
  residualStd: number,
): { lower: number[]; upper: number[] } {
  // Uncertainty grows with horizon (sqrt-scaling like random walk)
  const lower: number[] = [];
  const upper: number[] = [];
  for (let i = 0; i < predicted.length; i++) {
    const band = Z_80 * residualStd * Math.sqrt(i + 1);
    lower.push(Math.max(0, predicted[i] - band));
    upper.push(predicted[i] + band);
  }
  return { lower, upper };
}

function computeMape(actual: number[], fitted: number[]): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] > 0.01) {
      sum += Math.abs((actual[i] - fitted[i]) / actual[i]);
      n++;
    }
  }
  return n === 0 ? 0 : (sum / n) * 100;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. MOVING AVERAGE — baseline
   Forecast = mean of last `window` observations, flat line.
   ═══════════════════════════════════════════════════════════════════════════ */

export function movingAverage(
  history: number[],
  horizon: number,
  window = 14,
): ForecastResult {
  const w = Math.min(window, history.length);
  const last = history.slice(-w);
  const avg = mean(last);

  const predicted = Array(horizon).fill(avg);

  // In-sample fit: each point's "prediction" is avg of previous w values
  const fitted: number[] = [];
  for (let i = 0; i < history.length; i++) {
    const start = Math.max(0, i - w);
    const slice = history.slice(start, i);
    fitted.push(slice.length === 0 ? avg : mean(slice));
  }
  const residuals = history.map((h, i) => h - fitted[i]);
  const residualStd = stdDev(residuals);
  const mape = computeMape(history, fitted);
  const { lower, upper } = confidenceBands(predicted, residualStd);

  return { predicted, lower, upper, mape, residualStd };
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. LINEAR TREND — OLS regression y = a + b·x
   Captures long-term direction.
   ═══════════════════════════════════════════════════════════════════════════ */

export function linearTrend(history: number[], horizon: number): ForecastResult {
  const n = history.length;
  if (n < 2) return movingAverage(history, horizon);

  // Ordinary least squares: slope b, intercept a
  const xMean = (n - 1) / 2;
  const yMean = mean(history);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (history[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  const a = yMean - b * xMean;

  const fitted = history.map((_, i) => Math.max(0, a + b * i));
  const residuals = history.map((h, i) => h - fitted[i]);
  const residualStd = stdDev(residuals);

  const predicted: number[] = [];
  for (let i = 0; i < horizon; i++) {
    predicted.push(Math.max(0, a + b * (n + i)));
  }

  const mape = computeMape(history, fitted);
  const { lower, upper } = confidenceBands(predicted, residualStd);

  return { predicted, lower, upper, mape, residualStd };
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. SEASONAL NAIVE — weekly seasonality
   Forecast = value from same day-of-week 1 period ago.
   Good for spending that has weekend peaks.
   ═══════════════════════════════════════════════════════════════════════════ */

export function seasonalNaive(
  history: number[],
  horizon: number,
  period = 7,
): ForecastResult {
  if (history.length < period) return movingAverage(history, horizon);

  const predicted: number[] = [];
  for (let i = 0; i < horizon; i++) {
    const ref = history[history.length - period + (i % period)];
    predicted.push(ref);
  }

  // In-sample fit: each point is predicted by the same day-of-week from 1 period ago
  const fitted: number[] = [];
  for (let i = 0; i < history.length; i++) {
    fitted.push(i < period ? history[i] : history[i - period]);
  }
  const residuals = history.map((h, i) => h - fitted[i]);
  const residualStd = stdDev(residuals);
  const mape = computeMape(history, fitted);
  const { lower, upper } = confidenceBands(predicted, residualStd);

  return { predicted, lower, upper, mape, residualStd };
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. HOLT'S EXPONENTIAL SMOOTHING — level + trend
   Recurrence:
     level_t = α·y_t + (1 − α)·(level_{t−1} + trend_{t−1})
     trend_t = β·(level_t − level_{t−1}) + (1 − β)·trend_{t−1}
     forecast_{t+h} = level_t + h·trend_t
   ═══════════════════════════════════════════════════════════════════════════ */

export function holtSmoothing(
  history: number[],
  horizon: number,
  alpha = 0.3,
  beta = 0.1,
): ForecastResult {
  if (history.length < 2) return movingAverage(history, horizon);

  let level = history[0];
  let trend = history[1] - history[0];

  const fitted: number[] = [level];
  for (let i = 1; i < history.length; i++) {
    const prevLevel = level;
    level = alpha * history[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    fitted.push(level);
  }

  const predicted: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    predicted.push(Math.max(0, level + h * trend));
  }

  const residuals = history.map((h, i) => h - fitted[i]);
  const residualStd = stdDev(residuals);
  const mape = computeMape(history, fitted);
  const { lower, upper } = confidenceBands(predicted, residualStd);

  return { predicted, lower, upper, mape, residualStd };
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. ENSEMBLE — mean of all models, weighted by inverse MAPE
   The ensemble almost always beats individual models in practice.
   ═══════════════════════════════════════════════════════════════════════════ */

export function ensemble(history: number[], horizon: number): ForecastResult {
  const models = [
    movingAverage(history, horizon),
    linearTrend(history, horizon),
    seasonalNaive(history, horizon),
    holtSmoothing(history, horizon),
  ];

  // Weight inversely proportional to MAPE (cap to avoid div by zero)
  const weights = models.map((m) => 1 / Math.max(1, m.mape));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const normWeights = weights.map((w) => w / wSum);

  const predicted = Array(horizon).fill(0);
  const lower = Array(horizon).fill(0);
  const upper = Array(horizon).fill(0);

  for (let i = 0; i < horizon; i++) {
    for (let m = 0; m < models.length; m++) {
      predicted[i] += models[m].predicted[i] * normWeights[m];
      lower[i] += models[m].lower[i] * normWeights[m];
      upper[i] += models[m].upper[i] * normWeights[m];
    }
  }

  // Average MAPE weighted the same way
  const mape = models.reduce((s, m, i) => s + m.mape * normWeights[i], 0);
  const residualStd = models.reduce(
    (s, m, i) => s + m.residualStd * normWeights[i],
    0,
  );

  return { predicted, lower, upper, mape, residualStd };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Dispatcher
   ═══════════════════════════════════════════════════════════════════════════ */

export function forecastByModel(
  history: number[],
  horizon: number,
  model:
    | 'moving_average'
    | 'linear_trend'
    | 'seasonal_naive'
    | 'exponential_smoothing'
    | 'ensemble',
): ForecastResult {
  switch (model) {
    case 'moving_average':      return movingAverage(history, horizon);
    case 'linear_trend':        return linearTrend(history, horizon);
    case 'seasonal_naive':      return seasonalNaive(history, horizon);
    case 'exponential_smoothing': return holtSmoothing(history, horizon);
    case 'ensemble':            return ensemble(history, horizon);
  }
}
