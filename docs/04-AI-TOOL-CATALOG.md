# 04. AI Tool Catalog

Повний каталог AI-tools. Це окремий розділ магістерської — формальний каталог tools з типами та контрактами.

## 1. Структура каталогу

```
tools/
├── read/                 // безпечні, без mutation
│   ├── transactions/
│   ├── budgets/
│   ├── goals/
│   ├── cashflow/
│   ├── insights/
│   └── subscriptions/
├── mutation/             // потребують confirmation
│   ├── budgets/
│   ├── goals/
│   ├── rules/
│   ├── recommendations/
│   └── subscriptions/
├── cognitive/            // обчислювальні, можуть бути дорогими
│   ├── forecasting/
│   ├── simulation/
│   ├── explanation/
│   └── comparison/
└── memory/               // робота з AI memory
    ├── write/
    ├── recall/
    └── consolidate/
```

## 2. Read tools

### transactions

```typescript
search_transactions(filters: TransactionFilter): Transaction[]
// Filters: dateRange, categories, amountRange, merchants, accounts

aggregate_spending(period: Period, groupBy: GroupKey): Aggregation
// groupBy: category | merchant | day_of_week | hour_of_day | weekday_weekend

vector_search_transactions(query: string, k: number): Transaction[]
// Semantic search по описах

get_transaction(transactionId: string): Transaction
get_recurring_payments(): RecurringPayment[]
detect_unusual_transactions(period: Period): Transaction[]
```

### budgets

```typescript
get_budget(budgetId: string): Budget
get_active_budgets(): Budget[]
get_budget_health(userId: string): BudgetHealth
get_burn_rate(budgetLineId: string): BurnRate
get_envelope_balances(): Envelope[]
project_budget_endstate(budgetId: string): ProjectedState
```

### goals

```typescript
get_goals(userId: string): Goal[]
get_goal(goalId: string): Goal
get_goal_feasibility(goalId: string): FeasibilityReport
get_goal_progress(goalId: string): ProgressReport
get_required_contribution(goalId: string): Money
list_at_risk_goals(): Goal[]
```

### cashflow

```typescript
get_cashflow_projection(horizon: number): Projection
detect_deficits(horizon: number): DeficitWindow[]
get_recurring_cashflow(): { inflows: Recurring[], outflows: Recurring[] }
get_average_monthly_cashflow(): { avgInflow: Money, avgOutflow: Money }
```

### insights

```typescript
get_anomalies(period: Period): Anomaly[]
get_spending_trends(period: Period): TrendReport
get_category_drift(period: Period): CategoryDrift[]
get_subscription_summary(): SubscriptionSummary
```

### text_to_sql

```typescript
text_to_sql(query: string): SQLResult
// Existing tool, refactored с stricter sandbox
// Whitelist: SELECT only, обмежені tables, no joins до auth tables
```

## 3. Mutation tools (з two-step confirmation)

### budgets

```typescript
create_budget(spec: BudgetSpec): { stagedActionId: string, preview: Budget }
confirm_create_budget(stagedActionId: string): Budget

adjust_budget_line(spec: AdjustLineSpec): { stagedActionId, preview }
confirm_adjust_budget_line(stagedActionId): BudgetLine

rebalance_envelopes(strategy: RebalanceStrategy): { stagedActionId, preview }
confirm_rebalance_envelopes(stagedActionId): Envelope[]

archive_budget(budgetId: string): { stagedActionId, preview }
confirm_archive_budget(stagedActionId): Budget

transfer_envelope(from: string, to: string, amount: Money): { stagedActionId, preview }
confirm_transfer_envelope(stagedActionId): EnvelopeMovement
```

### goals

```typescript
create_goal(spec: GoalSpec): { stagedActionId, preview }
confirm_create_goal(stagedActionId): Goal

contribute_to_goal(goalId, amount, source): { stagedActionId, preview }
confirm_contribute_to_goal(stagedActionId): GoalContribution

update_goal_deadline(goalId, newDeadline): { stagedActionId, preview }
update_goal_target(goalId, newTarget): { stagedActionId, preview }
pause_goal(goalId): { stagedActionId, preview }
abandon_goal(goalId, reason): { stagedActionId, preview }
```

### rules

```typescript
create_rule(spec: RuleSpec): { stagedActionId, preview, dryRunResult }
confirm_create_rule(stagedActionId): Rule

enable_rule(ruleId): { stagedActionId, preview }
disable_rule(ruleId): void  // disable безпечне, без confirm
delete_rule(ruleId): { stagedActionId, preview }
```

### recommendations

```typescript
accept_recommendation(recId): { stagedActionId, preview, willApplyActions }
confirm_accept_recommendation(stagedActionId): RecommendationApplied

reject_recommendation(recId, reason): RecommendationFeedback
snooze_recommendation(recId, until): RecommendationFeedback
modify_recommendation(recId, modifications): { stagedActionId, preview }
```

### subscriptions

```typescript
flag_for_cancellation(subscriptionId): { stagedActionId, preview }
confirm_flag_for_cancellation(stagedActionId): Subscription

mark_as_essential(subscriptionId): Subscription
recategorize_subscription(subscriptionId, newCategory): { stagedActionId, preview }
```

## 4. Cognitive tools

### forecasting

```typescript
forecast_cashflow(horizon: number, assumptions?: Assumption[]): Projection
forecast_category_spending(categoryId: string, horizon: number): CategoryForecast
forecast_goal_completion(goalId: string): CompletionForecast
```

### simulation

```typescript
run_simulation(scenarioId: string): SimulationResult

simulate_what_if(changes: ScenarioChange[]): {
  baseline: Projection,
  modified: Projection,
  delta: ProjectionDelta
}

simulate_goal_addition(goal: GoalSpec): {
  feasibilityImpact: FeasibilityImpact,
  cashflowImpact: ProjectionDelta,
  conflictingGoals: Goal[]
}

simulate_budget_adjustment(adjustments: BudgetAdjustment[]): {
  projectedHealth: BudgetHealth,
  affectedGoals: GoalImpact[]
}
```

### explanation

```typescript
explain_anomaly(anomalyId: string): Explanation
// Структуроване пояснення: чому aномалія, які фактори, схожі випадки

explain_recommendation(recId: string): Explanation
// Чому ця рекомендація: контекст, дані, альтернативи

explain_forecast(projectionId: string): Explanation
// Які assumptions, які моделі, confidence breakdown

explain_budget_status(budgetId: string): Explanation
explain_goal_risk(goalId: string): Explanation
```

### comparison

```typescript
compare_periods(p1: Period, p2: Period): Comparison
compare_to_peers(metric: Metric): PeerComparison    // privacy-preserving
compare_recommendations(recIds: string[]): RecComparison
compare_scenarios(scenarioIds: string[]): ScenarioComparison
```

### recommendation generation (cognitive trigger)

```typescript
recommend_for_goal(goalId: string): Recommendation[]
recommend_spending_optimization(): Recommendation[]
recommend_savings_increase(): Recommendation[]
recommend_subscription_review(): Recommendation[]
```

## 5. Memory tools

### write

```typescript
write_user_preference(key: string, value: any, source: string): void
// e.g., write_user_preference('preferred_tone', 'direct', 'inferred_from_chat')

store_episodic_memory(event: EpisodicEvent): MemoryRecord
// Зберігає важливу подію (e.g., "user rejected aggressive saving plan")

mark_fact_as_persistent(content: string, importance: number): MemoryRecord
// Promote semantic fact

update_user_profile(updates: ProfileUpdate): UserProfile
```

### recall

```typescript
recall_similar_decisions(context: DecisionContext): MemoryRecord[]
// "What did user decide in similar past situations?"

recall_user_preferences(domain: string): Preference[]
// e.g., recall_user_preferences('budgeting') → ["prefers envelope method", "weekly cadence"]

recall_relevant_facts(query: string, k: number): MemoryRecord[]
recall_recent_actions(days: number): MemoryRecord[]
```

### consolidate

```typescript
consolidate_memory(userId: string): ConsolidationReport
// Triggered nightly; LLM reflection over episodic → promotes to semantic

forget(filter: ForgetFilter): void
// Explicit user request OR decay-based
```

## 6. Knowledge base tools

```typescript
search_knowledge(query: string, filter?: KBFilter): KBChunk[]
// Hybrid retrieval: dense + sparse + RRF

get_kb_document(documentId: string): KBDocument
list_kb_topics(): KBTopic[]
```

## 7. Контракти tool contracts (формально)

```typescript
interface ToolDefinition<TInput, TOutput> {
  name: string;
  category: 'READ' | 'MUTATION' | 'COGNITIVE' | 'MEMORY';
  description: string;             // Опис для LLM (включається в system prompt)
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  
  authorization: {
    scope: 'OWN_DATA' | 'AGGREGATED' | 'PUBLIC';
    requiresConfirmation: boolean;
  };
  
  sideEffects: {
    writes: string[];              // які entities зачіпаються
    emitsEvents: string[];         // які events emit
    estimatedCost: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  
  rateLimit: {
    perMinute: number;
    perHour: number;
  };
  
  fallback?: ToolDefinition<TInput, TOutput>;  // на випадок помилки
  
  execute(input: TInput, ctx: AgentContext): Promise<ToolResult<TOutput>>;
}

type ToolResult<T> = 
  | { ok: true; data: T; metadata: ResultMeta }
  | { ok: false; error: ToolError; retryable: boolean };
```

## 8. Tool metadata for LLM

Кожен tool має автоматично-згенерований prompt-fragment:

```
Tool: get_budget_health
Category: READ
Description: Returns overall health status of user's active budgets, including
  per-budget burn rates, projected overruns, and risk scores.
When to use: Коли user питає про стан бюджетів, "як я тримаюсь у плані",
  при перевищенні лімітів, перед формуванням recommendations.
Input: { userId: string }
Output: {
  budgets: [{ budgetId, name, status, burnRate, projectedOverrun, riskScore }]
}
Cost: LOW
Confirmation required: NO
```

## 9. Error handling

Усі tools повертають discriminated union:

```typescript
type ToolError =
  | { kind: 'AUTHORIZATION'; message: string }
  | { kind: 'VALIDATION'; field: string; message: string }
  | { kind: 'NOT_FOUND'; resource: string; id: string }
  | { kind: 'RATE_LIMITED'; retryAfter: number }
  | { kind: 'CONFIRMATION_REQUIRED'; stagedActionId: string }
  | { kind: 'CONFLICT'; conflictingResource: string }
  | { kind: 'EXTERNAL'; service: string; details: string }
  | { kind: 'INTERNAL'; correlationId: string };
```

Agent орбробляє кожен kind по-різному:
- `AUTHORIZATION` → перепитати user
- `VALIDATION` → виправити input і retry
- `NOT_FOUND` → інший шлях
- `RATE_LIMITED` → wait і retry
- `CONFIRMATION_REQUIRED` → handoff to user
- `CONFLICT` → resolve або escalate

## 10. Tool selection strategy

LLM не отримує всі 100+ tools одразу — це token-expensive. Натомість:

1. **Intent classification** на supervisor рівні визначає category
2. **Top-K tool selection** через embedding similarity до query
3. **Per-agent tool subset** — кожен sub-agent має свій restricted set
4. **Dynamic loading** — додаткові tools підвантажуються на запит ("я хочу зробити X" → load X-related tools)

---

## 8. Tools, додані у Phase 4–6 (актуально на момент thesis)

Каталог вище є проєктним; реалізовані інструменти збігаються концептуально,
але через ітеративну розробку фактичні імена і сигнатури такі (детальніше —
у [`backend/src/modules/ai/tools/`](backend/src/modules/ai/tools/)):

### Read (8)

| Tool | Призначення | Категорія |
|---|---|---|
| `get_budgets` | Активні бюджети + поточний період + здоров'я | READ |
| `get_categories` | Каталог категорій (id, slug, name, parent) | READ |
| `get_goals` | Активні цілі з прогресом і feasibility | READ |
| `get_cashflow` | Latest cashflow projection + deficits | READ |
| `get_recommendations` | Inbox PENDING/DELIVERED | READ |
| `get_transactions` | Фільтр за period/category/type + ліміт | READ |
| `get_subscriptions` | Виявлені регулярні платежі | READ |
| `get_fx_rate` | Курси Monobank `/bank/currency` + конверсія | READ |

### Cognitive (6)

| Tool | Призначення | Категорія |
|---|---|---|
| `run_scenario` | Monte Carlo what-if на cashflow | COGNITIVE |
| `get_cashflow_summary` | Стислий текстовий summary прогнозу | COGNITIVE |
| `explain_recommendation` | Текстове пояснення рекомендації | COGNITIVE |
| **`explain_spending_change`** | **V3 — причинна декомпозиція period A vs B (price/volume/mix)** | COGNITIVE |
| **`lookup_education`** | **RAG над UA-фінансовою базою знань (33 статті)** | COGNITIVE |
| **`calculate`** | **Калькулятор для арифметики LLM (захист V2-інваріанту)** | COGNITIVE |

### Mutation (8 — усі з two-step confirmation)

| Tool | Призначення | Side effects |
|---|---|---|
| `create_goal` | Створити фінансову ціль | writes: Goal |
| **`create_budget`** | **Створити бюджет + period + initial lines** | writes: Budget, BudgetPeriod, BudgetLine |
| **`add_budget_line`** | **Додати лінію до існуючого бюджету** | writes: BudgetLine |
| **`archive_budget`** | **Заархівувати бюджет** | writes: Budget |
| `contribute_to_goal` | Поповнити ціль | writes: Goal, GoalContribution |
| `adjust_budget_line` | Змінити плановану суму лінії | writes: BudgetLine |
| `accept_recommendation` | Прийняти рекомендацію | writes: Recommendation, Feedback |
| `snooze_recommendation` | Відкласти на 24h | writes: Recommendation |

### Memory (1)

| Tool | Призначення |
|---|---|
| `recall_memory` | Семантичний пошук у memory_records |

**Жирним** виділено tools, додані пізніше і пов'язані безпосередньо з V2/V3 та
RAG-частиною магістерської. Інші tools з §2–§5 каталогу залишаються concept-level
артефактами; фактична реалізація обмежена ~23 інструментами вище.

## 9. Інваріант V2 над усім каталогом

Кожен tool має `outputSchema` (Zod). Результати tool-викликів через `BaseAgent`
проходять у `VerificationService.verifyResponse`, який гарантує що:

  ∀ числові твердження у фінальній відповіді LLM ∃ значення у JSON-output
  якогось tool-call того ж агентського turn-у, з точністю до 1% або 0.5
  абсолютних одиниць.

`calculate` грається транзитивно: його результат вважається підкріпленим
тільки якщо кожен числовий літерал у виразі сам ∈ output(t') для іншого
t' (або є у первинному повідомленні користувача). Це закриває loophole
"LLM передає вигаданий аргумент у calculate і прикривається його результатом".
