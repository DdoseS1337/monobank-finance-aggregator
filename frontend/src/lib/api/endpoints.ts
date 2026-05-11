import { apiCall } from './client';
import type {
  AccountSummary,
  BudgetDto,
  CashflowProjectionDto,
  ChatResponseDto,
  GoalDto,
  MonobankLinkResult,
  NotificationDto,
  RecommendationDto,
  RuleDto,
  RuleTemplateDto,
  ScenarioDto,
  CategoryDto,
  KnowledgeArticleDto,
  ChatSessionSummary,
  ChatSessionTranscript,
  FxConvertDto,
  FxRateDto,
  ScenarioVariable,
  SpendingDecompositionDto,
  SpendingSummaryDto,
  StagedActionDto,
  TransactionPage,
  UserProfileDto,
} from './types';

// Accounts ────────────────────────────────────────────────────────────

export const accountsApi = {
  list: (token: string) =>
    apiCall<AccountSummary[]>('/accounts', { token }),
  linkMonobank: (token: string, monobankToken: string) =>
    apiCall<MonobankLinkResult>('/accounts/monobank/link', {
      token,
      method: 'POST',
      body: { token: monobankToken },
    }),
  unlink: (token: string, accountId: string) =>
    apiCall<{ ok: true }>(`/accounts/${accountId}`, {
      token,
      method: 'DELETE',
    }),
};

// Transactions ────────────────────────────────────────────────────────

export interface TransactionListQuery {
  accountIds?: string[];
  categoryIds?: string[];
  from?: string;
  to?: string;
  type?: 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'HOLD';
  isAnomaly?: boolean;
  search?: string;
  limit?: number;
  cursor?: string;
}

function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

export const transactionsApi = {
  list: (token: string, query: TransactionListQuery = {}) =>
    apiCall<TransactionPage>(
      `/transactions${toQuery(query as Record<string, unknown>)}`,
      { token },
    ),
  importIncremental: (token: string, accountId: string, sinceDays?: number) =>
    apiCall(`/transactions/accounts/${accountId}/import`, {
      token,
      method: 'POST',
      body: { sinceDays },
    }),
  importBackfill: (token: string, accountId: string, sinceDays?: number) =>
    apiCall(`/transactions/accounts/${accountId}/import/backfill`, {
      token,
      method: 'POST',
      body: { sinceDays },
    }),
  recategorize: (token: string, transactionId: string, newCategoryId: string) =>
    apiCall(`/transactions/${transactionId}/category`, {
      token,
      method: 'PATCH',
      body: { newCategoryId },
    }),
  spendingSummary: (token: string, range: { from?: string; to?: string } = {}) =>
    apiCall<SpendingSummaryDto>(
      `/transactions/spending-summary${toQuery(range as Record<string, unknown>)}`,
      { token },
    ),
  spendingDecomposition: (
    token: string,
    params: {
      fromA: string;
      toA: string;
      fromB: string;
      toB: string;
      groupBy?: 'merchant' | 'category';
    },
  ) =>
    apiCall<SpendingDecompositionDto>(
      `/transactions/spending-decomposition${toQuery(params as Record<string, unknown>)}`,
      { token },
    ),
};

// Categories ──────────────────────────────────────────────────────────

export const categoriesApi = {
  list: (token: string) => apiCall<CategoryDto[]>('/categories', { token }),
};

// Education / RAG ─────────────────────────────────────────────────────

export const educationApi = {
  search: (token: string, query: { q: string; k?: number; lang?: string }) =>
    apiCall<{ hits: KnowledgeArticleDto[] }>(
      `/education/search${toQuery(query as Record<string, unknown>)}`,
      { token },
    ),
  list: (token: string, lang = 'uk') =>
    apiCall<{ items: KnowledgeArticleDto[] }>(
      `/education/articles?lang=${lang}`,
      { token },
    ),
};

// FX ──────────────────────────────────────────────────────────────────

export const fxApi = {
  rates: (token: string, base?: string) =>
    apiCall<FxRateDto[]>(`/fx/rates${base ? `?base=${base}` : ''}`, { token }),
  convert: (
    token: string,
    params: { amount: number; from: string; to: string },
  ) =>
    apiCall<FxConvertDto>(
      `/fx/convert${toQuery(params as Record<string, unknown>)}`,
      { token },
    ),
};

// Budgets ─────────────────────────────────────────────────────────────

export const budgetsApi = {
  list: (token: string, includeArchived = false) =>
    apiCall<BudgetDto[]>(
      `/budgets${includeArchived ? '?includeArchived=true' : ''}`,
      { token },
    ),
  get: (token: string, id: string) =>
    apiCall<BudgetDto>(`/budgets/${id}`, { token }),
  create: (token: string, body: unknown) =>
    apiCall<BudgetDto>('/budgets', { token, method: 'POST', body }),
  addLine: (token: string, id: string, body: unknown) =>
    apiCall<BudgetDto>(`/budgets/${id}/lines`, {
      token,
      method: 'POST',
      body,
    }),
  adjustLine: (token: string, id: string, lineId: string, body: unknown) =>
    apiCall<BudgetDto>(`/budgets/${id}/lines/${lineId}`, {
      token,
      method: 'PATCH',
      body,
    }),
  removeLine: (token: string, id: string, lineId: string) =>
    apiCall<BudgetDto>(`/budgets/${id}/lines/${lineId}`, {
      token,
      method: 'DELETE',
    }),
  archive: (token: string, id: string) =>
    apiCall<BudgetDto>(`/budgets/${id}`, { token, method: 'DELETE' }),
};

// Goals ───────────────────────────────────────────────────────────────

export const goalsApi = {
  list: (token: string, includeInactive = false) =>
    apiCall<GoalDto[]>(
      `/goals${includeInactive ? '?includeInactive=true' : ''}`,
      { token },
    ),
  get: (token: string, id: string) =>
    apiCall<GoalDto>(`/goals/${id}`, { token }),
  create: (token: string, body: unknown) =>
    apiCall<GoalDto>('/goals', { token, method: 'POST', body }),
  contribute: (token: string, id: string, amount: string) =>
    apiCall<GoalDto>(`/goals/${id}/contributions`, {
      token,
      method: 'POST',
      body: { amount },
    }),
  adjustTarget: (token: string, id: string, newTarget: string) =>
    apiCall<GoalDto>(`/goals/${id}/target`, {
      token,
      method: 'PATCH',
      body: { newTarget },
    }),
  adjustDeadline: (token: string, id: string, newDeadline: string | null) =>
    apiCall<GoalDto>(`/goals/${id}/deadline`, {
      token,
      method: 'PATCH',
      body: { newDeadline },
    }),
  pause: (token: string, id: string) =>
    apiCall<GoalDto>(`/goals/${id}/pause`, { token, method: 'POST' }),
  resume: (token: string, id: string) =>
    apiCall<GoalDto>(`/goals/${id}/resume`, { token, method: 'POST' }),
  abandon: (token: string, id: string, reason?: string) =>
    apiCall<GoalDto>(`/goals/${id}`, {
      token,
      method: 'DELETE',
      body: { reason },
    }),
  recalcFeasibility: (token: string, id: string) =>
    apiCall<{ goal: GoalDto; score: number }>(
      `/goals/${id}/feasibility/recalculate`,
      { token, method: 'POST' },
    ),
};

// Cashflow ────────────────────────────────────────────────────────────

export const cashflowApi = {
  latest: (token: string) =>
    apiCall<CashflowProjectionDto | null>('/cashflow/latest', { token }),
  history: (token: string, limit = 10) =>
    apiCall<
      Array<{
        id: string;
        generatedAt: string;
        horizonDays: number;
        modelVersion: string;
        confidenceScore: number | null;
        isLatest: boolean;
      }>
    >(`/cashflow/history?limit=${limit}`, { token }),
  refresh: (token: string, body?: { horizonDays?: number; trials?: number }) =>
    apiCall<{
      projection: CashflowProjectionDto;
      trialsRun: number;
      deficitProbability: number;
    }>('/cashflow/refresh', { token, method: 'POST', body: body ?? {} }),
  deficits: (token: string) =>
    apiCall<
      Array<{
        id: string;
        predictedFor: string;
        estimatedAmount: string;
        confidence: number;
      }>
    >('/cashflow/deficits', { token }),
};

// Scenarios ───────────────────────────────────────────────────────────

export const scenariosApi = {
  list: (token: string) => apiCall<ScenarioDto[]>('/scenarios', { token }),
  get: (token: string, id: string) =>
    apiCall<ScenarioDto>(`/scenarios/${id}`, { token }),
  create: (
    token: string,
    body: { name: string; variables: ScenarioVariable[]; runNow?: boolean },
  ) => apiCall<ScenarioDto>('/scenarios', { token, method: 'POST', body }),
  resimulate: (token: string, id: string) =>
    apiCall<ScenarioDto>(`/scenarios/${id}/resimulate`, {
      token,
      method: 'POST',
    }),
  delete: (token: string, id: string) =>
    apiCall<{ ok: true }>(`/scenarios/${id}`, { token, method: 'DELETE' }),
};

// Recommendations ─────────────────────────────────────────────────────

export interface RecommendationsListQuery {
  status?: string[];
  kinds?: string[];
  validOnly?: boolean;
  limit?: number;
}

export const recommendationsApi = {
  list: (token: string, query: RecommendationsListQuery = {}) =>
    apiCall<RecommendationDto[]>(
      `/recommendations${toQuery(query as Record<string, unknown>)}`,
      { token },
    ),
  get: (token: string, id: string) =>
    apiCall<RecommendationDto>(`/recommendations/${id}`, { token }),
  accept: (token: string, id: string, feedbackText?: string) =>
    apiCall<RecommendationDto>(`/recommendations/${id}/accept`, {
      token,
      method: 'POST',
      body: { feedbackText },
    }),
  reject: (token: string, id: string, feedbackText?: string) =>
    apiCall<RecommendationDto>(`/recommendations/${id}/reject`, {
      token,
      method: 'POST',
      body: { feedbackText },
    }),
  snooze: (token: string, id: string, snoozeHours = 24) =>
    apiCall<RecommendationDto>(`/recommendations/${id}/snooze`, {
      token,
      method: 'POST',
      body: { snoozeHours },
    }),
  refresh: (token: string) =>
    apiCall<{
      generated: number;
      skipped: number;
      persisted: number;
      byGenerator: Record<string, number>;
    }>('/recommendations/refresh', { token, method: 'POST' }),
};

// Notifications ───────────────────────────────────────────────────────

export const notificationsApi = {
  inbox: (token: string, opts: { unreadOnly?: boolean; limit?: number } = {}) =>
    apiCall<NotificationDto[]>(
      `/notifications/inbox${toQuery(opts as Record<string, unknown>)}`,
      { token },
    ),
  open: (token: string, id: string) =>
    apiCall<{ ok: true }>(`/notifications/${id}/opened`, {
      token,
      method: 'POST',
    }),
  click: (token: string, id: string) =>
    apiCall<{ ok: true }>(`/notifications/${id}/clicked`, {
      token,
      method: 'POST',
    }),
  dismiss: (token: string, id: string) =>
    apiCall<{ ok: true }>(`/notifications/${id}/dismissed`, {
      token,
      method: 'POST',
    }),
};

// Personalization ─────────────────────────────────────────────────────

export const personalizationApi = {
  get: (token: string) =>
    apiCall<UserProfileDto>('/personalization/profile', { token }),
  update: (token: string, body: Partial<UserProfileDto>) =>
    apiCall<UserProfileDto>('/personalization/profile', {
      token,
      method: 'PATCH',
      body,
    }),
  recomputeTraits: (token: string) =>
    apiCall<UserProfileDto>('/personalization/profile/recompute-traits', {
      token,
      method: 'POST',
    }),
};

// Rules ───────────────────────────────────────────────────────────────

export const rulesApi = {
  list: (token: string) => apiCall<RuleDto[]>('/rules', { token }),
  templates: (token: string) =>
    apiCall<RuleTemplateDto[]>('/rules/templates', { token }),
  createFromTemplate: (
    token: string,
    body: { templateId: string; values: Record<string, unknown> },
  ) =>
    apiCall<RuleDto>('/rules/from-template', {
      token,
      method: 'POST',
      body,
    }),
  enable: (token: string, id: string) =>
    apiCall<RuleDto>(`/rules/${id}/enable`, { token, method: 'POST' }),
  disable: (token: string, id: string) =>
    apiCall<RuleDto>(`/rules/${id}/disable`, { token, method: 'POST' }),
  delete: (token: string, id: string) =>
    apiCall<{ ok: true }>(`/rules/${id}`, { token, method: 'DELETE' }),
};

// AI Chat ─────────────────────────────────────────────────────────────

export const aiApi = {
  chat: (token: string, body: { message: string; sessionId?: string }) =>
    apiCall<ChatResponseDto>('/ai/chat', { token, method: 'POST', body }),
  listSessions: (token: string) =>
    apiCall<ChatSessionSummary[]>('/ai/sessions', { token }),
  getSession: (token: string, id: string) =>
    apiCall<ChatSessionTranscript>(`/ai/sessions/${id}`, { token }),
  pendingActions: (token: string) =>
    apiCall<StagedActionDto[]>('/ai/staged-actions', { token }),
  confirm: (token: string, id: string) =>
    apiCall<{ ok: true; result: unknown }>(`/ai/staged-actions/${id}/confirm`, {
      token,
      method: 'POST',
    }),
  reject: (token: string, id: string) =>
    apiCall<{ ok: true }>(`/ai/staged-actions/${id}/reject`, {
      token,
      method: 'POST',
    }),
};
