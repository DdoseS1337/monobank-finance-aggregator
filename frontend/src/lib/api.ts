import { API_URL } from './constants';
import { createClient } from './supabase/client';
import type {
  AiModelId,
  AiModelsResponse,
  AiThread,
  AiThreadWithMessages,
  AnalyticsSummary,
  BankAccount,
  BurnRate,
  CashFlowForecast,
  CategoryForecast,
  DayOfWeekItem,
  EndOfMonthProjection,
  FinancialHabits,
  ForecastModel,
  Insight,
  InsightsResponse,
  ModelComparisonItem,
  MonthPeriodBehavior,
  MonthlyTrendItem,
  PeriodComparisonItem,
  RecurringExpense,
  RegularPayment,
  SpendingByCategoryItem,
  SpendingTrendItem,
  Subscription,
  SyncRequest,
  SyncResponse,
  TopCategoryItem,
  TopMerchantItem,
  Transaction,
  TransactionFilters,
} from './types';

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

export async function fetchAccounts(token: string): Promise<BankAccount[]> {
  const res = await fetch(
    `${API_URL}/transactions/accounts?source=monobank&token=${encodeURIComponent(token)}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Не вдалося отримати рахунки');
  }
  return res.json();
}

export async function syncTransactions(body: SyncRequest): Promise<SyncResponse> {
  const res = await fetch(`${API_URL}/transactions/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Помилка синхронізації');
  }
  return res.json();
}

export async function getTransactions(
  filters?: TransactionFilters,
): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.category) params.set('category', filters.category);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.skip != null) params.set('skip', String(filters.skip));
  if (filters?.take != null) params.set('take', String(filters.take));

  const res = await fetch(`${API_URL}/transactions?${params.toString()}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Не вдалося отримати транзакції');
  }
  return res.json();
}

// ── Analytics ────────────────────────────────────────────────────────────────

function buildAnalyticsParams(from?: string, to?: string, accountId?: string, extra?: Record<string, string>): string {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  if (accountId) p.set('accountId', accountId);
  if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  return p.toString();
}

async function analyticsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/analytics/${path}`, { headers: await authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Помилка аналітики');
  }
  return res.json();
}

export async function getAnalyticsSummary(accountId?: string): Promise<AnalyticsSummary> {
  const q = buildAnalyticsParams(undefined, undefined, accountId);
  return analyticsGet<AnalyticsSummary>(`summary${q ? `?${q}` : ''}`);
}

export async function getMonthlyTrend(from?: string, to?: string, accountId?: string): Promise<MonthlyTrendItem[]> {
  const q = buildAnalyticsParams(from, to, accountId);
  return analyticsGet<MonthlyTrendItem[]>(`monthly-trend${q ? `?${q}` : ''}`);
}

export async function getSpendingTrend(from?: string, to?: string, accountId?: string): Promise<SpendingTrendItem[]> {
  const q = buildAnalyticsParams(from, to, accountId);
  return analyticsGet<SpendingTrendItem[]>(`spending-trend${q ? `?${q}` : ''}`);
}

export async function getSpendingByCategory(from?: string, to?: string, accountId?: string): Promise<SpendingByCategoryItem[]> {
  const q = buildAnalyticsParams(from, to, accountId);
  return analyticsGet<SpendingByCategoryItem[]>(`spending-by-category${q ? `?${q}` : ''}`);
}

export async function getDayOfWeek(from?: string, to?: string, accountId?: string): Promise<DayOfWeekItem[]> {
  const q = buildAnalyticsParams(from, to, accountId);
  return analyticsGet<DayOfWeekItem[]>(`day-of-week${q ? `?${q}` : ''}`);
}

export async function getTopCategories(from?: string, to?: string, limit = 8, accountId?: string): Promise<TopCategoryItem[]> {
  const q = buildAnalyticsParams(from, to, accountId, { limit: String(limit) });
  return analyticsGet<TopCategoryItem[]>(`top-categories${q ? `?${q}` : ''}`);
}

export async function getTopMerchants(from?: string, to?: string, limit = 8, accountId?: string): Promise<TopMerchantItem[]> {
  const q = buildAnalyticsParams(from, to, accountId, { limit: String(limit) });
  return analyticsGet<TopMerchantItem[]>(`top-merchants${q ? `?${q}` : ''}`);
}

export async function getPeriodComparison(
  period1From: string, period1To: string,
  period2From: string, period2To: string,
  accountId?: string,
): Promise<PeriodComparisonItem[]> {
  const p = new URLSearchParams({ period1From, period1To, period2From, period2To });
  if (accountId) p.set('accountId', accountId);
  return analyticsGet<PeriodComparisonItem[]>(`period-comparison?${p.toString()}`);
}

// ── Patterns ────────────────────────────────────────────────────────────────

async function patternsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/patterns/${path}`, { headers: await authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Помилка патернів');
  }
  return res.json();
}

function buildPatternsParams(
  from?: string,
  to?: string,
  accountId?: string,
  minOccurrences?: number,
): string {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  if (accountId) p.set('accountId', accountId);
  if (minOccurrences != null) p.set('minOccurrences', String(minOccurrences));
  return p.toString();
}

export async function getRegularPayments(
  from?: string, to?: string, accountId?: string, minOccurrences?: number,
): Promise<RegularPayment[]> {
  const q = buildPatternsParams(from, to, accountId, minOccurrences);
  return patternsGet<RegularPayment[]>(`regular-payments${q ? `?${q}` : ''}`);
}

export async function getSubscriptions(
  from?: string, to?: string, accountId?: string, minOccurrences?: number,
): Promise<Subscription[]> {
  const q = buildPatternsParams(from, to, accountId, minOccurrences);
  return patternsGet<Subscription[]>(`subscriptions${q ? `?${q}` : ''}`);
}

export async function getRecurringExpenses(
  from?: string, to?: string, accountId?: string, minOccurrences?: number,
): Promise<RecurringExpense[]> {
  const q = buildPatternsParams(from, to, accountId, minOccurrences);
  return patternsGet<RecurringExpense[]>(`recurring-expenses${q ? `?${q}` : ''}`);
}

export async function getMonthPeriodBehavior(
  from?: string, to?: string, accountId?: string,
): Promise<MonthPeriodBehavior[]> {
  const q = buildPatternsParams(from, to, accountId);
  return patternsGet<MonthPeriodBehavior[]>(`month-period${q ? `?${q}` : ''}`);
}

export async function getFinancialHabits(
  from?: string, to?: string, accountId?: string,
): Promise<FinancialHabits> {
  const q = buildPatternsParams(from, to, accountId);
  return patternsGet<FinancialHabits>(`habits${q ? `?${q}` : ''}`);
}

// ── Insights ────────────────────────────────────────────────────────────────

async function insightsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/insights${path ? `/${path}` : ''}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Помилка інсайтів');
  }
  return res.json();
}

function buildInsightsParams(from?: string, to?: string, accountId?: string): string {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  if (accountId) p.set('accountId', accountId);
  return p.toString();
}

export async function getAllInsights(
  from?: string, to?: string, accountId?: string,
): Promise<InsightsResponse> {
  const q = buildInsightsParams(from, to, accountId);
  return insightsGet<InsightsResponse>(`${q ? `?${q}` : ''}`);
}

export async function getAnomalies(
  from?: string, to?: string, accountId?: string,
): Promise<Insight[]> {
  const q = buildInsightsParams(from, to, accountId);
  return insightsGet<Insight[]>(`anomalies${q ? `?${q}` : ''}`);
}

export async function getCategorySpikes(
  from?: string, to?: string, accountId?: string,
): Promise<Insight[]> {
  const q = buildInsightsParams(from, to, accountId);
  return insightsGet<Insight[]>(`category-spikes${q ? `?${q}` : ''}`);
}

export async function getUnusualPurchases(
  from?: string, to?: string, accountId?: string,
): Promise<Insight[]> {
  const q = buildInsightsParams(from, to, accountId);
  return insightsGet<Insight[]>(`unusual-purchases${q ? `?${q}` : ''}`);
}

export async function getConclusions(
  from?: string, to?: string, accountId?: string,
): Promise<Insight[]> {
  const q = buildInsightsParams(from, to, accountId);
  return insightsGet<Insight[]>(`conclusions${q ? `?${q}` : ''}`);
}

// ── Forecasting ─────────────────────────────────────────────────────────────

async function forecastGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/forecast/${path}`, { headers: await authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Помилка прогнозу');
  }
  return res.json();
}

function buildForecastParams(opts: {
  accountId?: string;
  horizonDays?: number;
  model?: ForecastModel;
  lookbackDays?: number;
}): string {
  const p = new URLSearchParams();
  if (opts.accountId) p.set('accountId', opts.accountId);
  if (opts.horizonDays != null) p.set('horizonDays', String(opts.horizonDays));
  if (opts.model) p.set('model', opts.model);
  if (opts.lookbackDays != null) p.set('lookbackDays', String(opts.lookbackDays));
  return p.toString();
}

export async function getCashFlowForecast(opts: {
  accountId?: string;
  horizonDays?: number;
  model?: ForecastModel;
  lookbackDays?: number;
} = {}): Promise<CashFlowForecast> {
  const q = buildForecastParams(opts);
  return forecastGet<CashFlowForecast>(`cash-flow${q ? `?${q}` : ''}`);
}

export async function getEndOfMonthProjection(
  accountId?: string,
): Promise<EndOfMonthProjection> {
  const q = buildForecastParams({ accountId });
  return forecastGet<EndOfMonthProjection>(`end-of-month${q ? `?${q}` : ''}`);
}

export async function getCategoryForecasts(
  accountId?: string, lookbackDays?: number,
): Promise<CategoryForecast[]> {
  const q = buildForecastParams({ accountId, lookbackDays });
  return forecastGet<CategoryForecast[]>(`by-category${q ? `?${q}` : ''}`);
}

export async function getBurnRate(
  accountId?: string, lookbackDays?: number,
): Promise<BurnRate> {
  const q = buildForecastParams({ accountId, lookbackDays });
  return forecastGet<BurnRate>(`burn-rate${q ? `?${q}` : ''}`);
}

export async function getModelComparison(opts: {
  accountId?: string;
  horizonDays?: number;
  lookbackDays?: number;
} = {}): Promise<ModelComparisonItem[]> {
  const q = buildForecastParams(opts);
  return forecastGet<ModelComparisonItem[]>(`model-comparison${q ? `?${q}` : ''}`);
}

// ── AI Assistant ───────────────────────────────────────────────────────────

async function aiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/ai/${path}`, { headers: await authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Помилка AI');
  }
  return res.json();
}

async function aiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/ai/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Помилка AI');
  }
  return res.json();
}

export async function getAiModels(): Promise<AiModelsResponse> {
  return aiGet<AiModelsResponse>('models');
}

export async function listAiThreads(): Promise<AiThread[]> {
  return aiGet<AiThread[]>('threads');
}

export async function createAiThread(model?: AiModelId): Promise<AiThread> {
  return aiSend<AiThread>('threads', 'POST', { model });
}

export async function getAiThread(id: string): Promise<AiThreadWithMessages> {
  return aiGet<AiThreadWithMessages>(`threads/${id}`);
}

export async function deleteAiThread(id: string): Promise<void> {
  await aiSend<{ ok: boolean }>(`threads/${id}`, 'DELETE');
}

export async function updateAiThread(
  id: string,
  data: { title?: string; model?: AiModelId },
): Promise<void> {
  await aiSend<{ ok: boolean }>(`threads/${id}`, 'PATCH', data);
}

/**
 * Build fresh headers for streaming chat requests. Only returns auth —
 * AI SDK's DefaultChatTransport adds `Content-Type: application/json` itself,
 * and duplicating it causes Express body-parser to skip parsing.
 */
export async function buildAiChatHeaders(): Promise<Record<string, string>> {
  return { ...(await authHeaders()) };
}

export function aiChatUrl(): string {
  return `${API_URL}/ai/chat`;
}
