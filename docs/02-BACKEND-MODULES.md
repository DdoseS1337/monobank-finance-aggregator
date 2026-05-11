# 02. Архітектура backend-модулів

## 1. Структура NestJS-модулів

```
src/
├── modules/
│   ├── identity/                  // existing
│   ├── accounts/                  // existing
│   ├── transactions/              // existing
│   ├── categorization/            // existing
│   ├── insights/                  // existing
│   ├── subscriptions/             // existing
│   │
│   ├── budgeting/                 // NEW — core
│   │   ├── domain/
│   │   │   ├── budget.entity.ts
│   │   │   ├── budget-period.entity.ts
│   │   │   ├── budget-line.entity.ts
│   │   │   ├── envelope.entity.ts
│   │   │   ├── value-objects/
│   │   │   ├── repositories.interface.ts
│   │   │   └── events/
│   │   ├── application/
│   │   │   ├── commands/          // CreateBudget, AdjustEnvelope
│   │   │   ├── queries/           // GetBudgetHealth, GetBurnRate
│   │   │   ├── sagas/             // BudgetPeriodLifecycleSaga
│   │   │   └── handlers/
│   │   ├── infrastructure/
│   │   │   ├── prisma/
│   │   │   └── repositories.impl.ts
│   │   └── presentation/
│   │       ├── controllers/
│   │       └── dto/
│   │
│   ├── goals/                     // NEW — core
│   ├── cashflow/                  // NEW — core
│   │   └── application/
│   │       ├── forecasting/       // Prophet/ARIMA + LLM hybrid
│   │       ├── simulation/        // What-if engine
│   │       └── deficit-detector/
│   │
│   ├── recommendations/           // NEW — core
│   │   └── application/
│   │       ├── generators/        // RuleBasedGen, MLGen, AIGen
│   │       ├── ranker/            // multi-criteria ranking
│   │       └── orchestrator/      // pipeline
│   │
│   ├── rules/                     // NEW — supporting
│   │   └── engine/                // condition AST + evaluator
│   │
│   ├── notifications/             // NEW — supporting
│   │   ├── channels/              // push, email, in-app, telegram
│   │   ├── orchestrator/          // delivery, dedup, throttling
│   │   └── templates/
│   │
│   ├── personalization/           // NEW — supporting
│   │   └── behavior-model/
│   │
│   ├── ai/                        // existing, REFACTOR
│   │   ├── agents/                // multi-agent: Planner, Coach, Analyst
│   │   ├── tools/                 // tool catalog
│   │   ├── memory/                // semantic/episodic/procedural
│   │   ├── rag/
│   │   ├── orchestration/         // LangGraph
│   │   └── guardrails/            // PII, hallucination guards
│   │
│   └── shared-kernel/
│       ├── money/                 // Money value object
│       ├── period/                // Period VO
│       └── events/                // event bus, outbox
└── workers/                       // BullMQ processors
```

## 2. Budgeting Engine

### Підходи (це показує академічну глибину)

1. **Category-based budgeting** — класичний (50/30/20)
2. **Envelope budgeting** — money allocated to envelopes; перевитрата неможлива без переносу
3. **Zero-based budgeting (ZBB)** — кожна гривня має призначення
4. **Pay-yourself-first (PYF)** — savings allocated першими

### Entity model

```typescript
// budgeting/domain/budget.entity.ts
class Budget {
  id: BudgetId;
  userId: UserId;
  name: string;
  method: BudgetMethod;            // CATEGORY | ENVELOPE | ZERO_BASED | PYF
  cadence: Cadence;                 // WEEKLY | MONTHLY | CUSTOM
  baseCurrency: Currency;
  status: BudgetStatus;             // DRAFT | ACTIVE | ARCHIVED
  periods: BudgetPeriod[];
  rolloverPolicy: RolloverPolicy;   // CARRY_OVER | RESET | PARTIAL
  
  startNewPeriod(): BudgetPeriodStarted;
  evaluateHealth(): BudgetHealth;   // GREEN | YELLOW | RED
  rebalance(strategy: RebalanceStrategy): EnvelopeRebalanced;
  archive(): void;
}

class BudgetLine {
  id: BudgetLineId;
  categoryId: CategoryId;
  plannedAmount: Money;
  spentAmount: Money;               // projected via materialized view
  thresholdAlert: Percentage;       // 80% за замовчуванням
  
  burnRate(): BurnRate;             // % spent / % time elapsed
  isAtRisk(): boolean;
  daysUntilExhausted(): number;
  projectedOverrun(): Money;
}

class EnvelopeBucket {
  id: EnvelopeId;
  userId: UserId;
  name: string;
  balance: Money;
  targetBalance: Money;
  color: string;
  sortOrder: number;
  
  fund(amount: Money, source: FundingSource): EnvelopeMovement;
  spend(amount: Money, transactionId: TransactionId): EnvelopeMovement;
  transfer(target: EnvelopeBucket, amount: Money): EnvelopeRebalanced;
  isOverdrawn(): boolean;
}
```

### Saga для lifecycle

`BudgetPeriodLifecycleSaga`:
1. Слухає `TransactionCategorized` → updates `BudgetLine.spentAmount`
2. На кожному update перевіряє threshold → emit `BudgetLineExceededWarning` / `Critical`
3. На останній день періоду → emit `BudgetPeriodClosed` → applies rollover policy
4. Відкриває `BudgetPeriodStarted` для наступного періоду

## 3. Goal Planning Engine

```typescript
class FinancialGoal {
  id: GoalId;
  userId: UserId;
  type: GoalType;                   // SAVING | DEBT_PAYOFF | INVESTMENT | PURCHASE
  name: string;
  targetAmount: Money;
  currentAmount: Money;
  deadline: Date;
  priority: Priority;               // 1..5
  fundingStrategy: FundingStrategy; // FIXED_MONTHLY | PERCENTAGE_INCOME | SURPLUS
  linkedAccountId?: AccountId;      // virtual sub-account
  status: GoalStatus;
  
  projectedCompletionDate(): Date;  // на основі поточної швидкості
  isOnTrack(): boolean;
  requiredMonthlyContribution(): Money;
  feasibilityScore(): number;       // 0..1, Monte Carlo
  riskScore(): number;              // 0..1
  contribute(amount: Money, source: ContributionSource): GoalContribution;
}

class SavingsPlan {
  // multi-step план з automation rules
  steps: PlanStep[];
  // напр., "коли surplus > 5000 → 60% у Goal A, 40% у Goal B"
}
```

### Goal Feasibility Score (формальна модель)

```
feasibility(goal) = P(currentAmount + Σ contributions ≥ targetAmount | deadline)

Де contributions = Monte Carlo simulation на історії доходів/витрат
користувача (N=1000 trials), з урахуванням:
- активних бюджетів
- періодичних доходів
- сезонності витрат
- інших активних цілей (resource competition)
```

## 4. Cash Flow & Forecasting Engine

### Pipeline

```
┌──────────────────────────────────────────────────────────┐
│ Cash Flow Forecasting Pipeline                           │
├──────────────────────────────────────────────────────────┤
│ 1. Recurring detector (subscriptions, salary, rent)      │
│ 2. Time-series base forecast (Prophet/ARIMA)             │
│ 3. Categorical decomposition (per-category forecast)     │
│ 4. Constraint injection (active goals, planned events)   │
│ 5. Monte Carlo simulation (N=1000 trials)                │
│ 6. LLM-based qualitative adjuster (контекст user prefs)  │
│ 7. Confidence intervals (P10/P50/P90)                    │
│ 8. Persist projection + emit DeficitPredicted if any     │
└──────────────────────────────────────────────────────────┘
```

### Entity

```typescript
class CashFlowProjection {
  id: ProjectionId;
  userId: UserId;
  horizon: Period;                  // next 30/60/90 days
  generatedAt: DateTime;
  modelVersion: string;
  points: ProjectionPoint[];        // дата → balance + ranges (P10/P50/P90)
  assumptions: ProjectionAssumption[];
  confidenceScore: number;
  
  detectDeficit(threshold: Money): DeficitWindow[];
  toScenarioBaseline(): Scenario;
}

class Scenario {
  baselineProjectionId: ProjectionId;
  variables: ScenarioVariable[];    // зміни параметрів
  outcomes: ScenarioOutcome[];      // computed з симуляції
  
  // What-if: "що якщо я додам ціль 'Кругосвітка' за 50 000?"
  simulate(): ScenarioOutcome[];
  compareToBaseline(): ComparisonResult;
}
```

## 5. Recommendation Engine

### Архітектура — Hybrid (Rule-based + ML + LLM)

```
            ┌──────────────────┐
            │  Trigger Sources │  Domain Events / Cron / User Action
            └────────┬─────────┘
                     ▼
            ┌──────────────────┐
            │  Context Builder │  Збирає user state, history, prefs
            └────────┬─────────┘
                     ▼
        ┌────────────┴────────────┐
        ▼            ▼            ▼
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │  Rules  │  │   ML    │  │   LLM   │  Generators (parallel)
  │ Engine  │  │ Models  │  │  Agent  │
  └────┬────┘  └────┬────┘  └────┬────┘
       └────────────┼────────────┘
                    ▼
          ┌──────────────────┐
          │   Aggregator     │  Збір candidates
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │   Ranker (MCDM)  │  multi-criteria: utility, urgency, novelty,
          └────────┬─────────┘  user-fit (vector similarity з прийнятими)
                   ▼
          ┌──────────────────┐
          │ Deduplication &  │  не показувати знов те, що user відхилив
          │  Cooldown        │
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │  Personalization │  Тон, формат, мова згідно UserProfile
          │  & Templating    │
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │ Notification     │
          │ Orchestrator     │
          └──────────────────┘
```

### Категорії рекомендацій

- **Spending** — "скоротіть категорію X на Y, бо тренд +30%"
- **Saving** — "перенесіть надлишок 2 100 ₴ у ціль 'Подушка'"
- **Subscription** — "ви не користувались Spotify 60 днів"
- **Budget** — "збільште envelope 'Продукти': 4-й місяць поспіль перевитрата"
- **Goal** — "ціль 'Авто' під ризиком; пропоную +800 ₴/міс або +3 міс дедлайн"
- **Cashflow** — "за 18 днів дефіцит -3 200 ₴; план дій"
- **Behavioral** — "ви частіше витрачаєте увечері; пропоную evening-spending lock"

### Multi-criteria ranking (MCDM)

```
score(c) = w₁·utility(c) + w₂·urgency(c) + w₃·novelty(c) + w₄·user_fit(c)

де:
- utility   = очікуваний фінансовий impact (₴)
- urgency   = 1 / time_to_consequence
- novelty   = 1 - similarity to recent recommendations
- user_fit  = cosine_similarity(c.embedding, accepted_recs.centroid)

ваги w_i — налаштовуються per UserProfile (risk tolerance впливає)
```

## 6. Rule Engine

```typescript
class Rule {
  id: RuleId;
  name: string;
  trigger: TriggerSpec;             // EVENT | SCHEDULE | THRESHOLD
  conditions: ConditionAST;         // boolean expression tree
  actions: ActionSpec[];
  priority: number;
  cooldown: Duration;
  enabled: boolean;
}

// Приклад rule:
// when transaction.category = 'Salary' AND transaction.amount > 0
// then:
//   - allocate 10% to envelope 'Emergency Fund'
//   - allocate 20% to goal 'Apartment'
//   - allocate 70% to budget 'Monthly Spending'
```

### AST (приклад)

```typescript
type ConditionAST =
  | { op: 'AND'; left: ConditionAST; right: ConditionAST }
  | { op: 'OR'; left: ConditionAST; right: ConditionAST }
  | { op: 'NOT'; expr: ConditionAST }
  | { op: 'EQ'; field: string; value: any }
  | { op: 'GT'; field: string; value: number }
  | { op: 'LT'; field: string; value: number }
  | { op: 'IN'; field: string; values: any[] }
  | { op: 'MATCH'; field: string; pattern: string };

type ActionSpec =
  | { type: 'ALLOCATE_PERCENT'; target: TargetRef; percent: number }
  | { type: 'ALLOCATE_FIXED'; target: TargetRef; amount: Money }
  | { type: 'TRANSFER'; from: TargetRef; to: TargetRef; amount: Money }
  | { type: 'NOTIFY'; channel: Channel; template: string }
  | { type: 'CREATE_RECOMMENDATION'; kind: string; payload: any };
```

### Безпека

- AST-evaluator з безпечним sandbox (без eval)
- Whitelist полів для conditions
- Authorization check для actions (user не може allocate в чужий goal)
- Conflict detection (два rules → змагання за ту саму mutation)

## 7. Notification Orchestration

```
Recommendation → Channel Selector → Throttler → Deduplicator
                       ↓
                  ┌────┴────┬─────────┬──────────┐
                  ▼         ▼         ▼          ▼
                Push      Email    In-App    Telegram
```

### Особливості

- **Quiet hours** (per user) — нічого не надсилати з 22:00 до 8:00
- **Channel preference learning** — як користувач реагує на push vs email
- **Importance-aware routing** — critical → all channels, info → in-app only
- **Delivery receipts → feedback loop** — повертаються в recommendation learning
- **Dedup keys** — не дублювати ті ж сповіщення (e.g., "budget exceeded" raз на день max)

## 8. Personalization Layer

```typescript
class UserProfile {
  userId: UserId;
  riskTolerance: RiskTolerance;     // CONSERVATIVE | MODERATE | AGGRESSIVE
  financialLiteracyLevel: Level;    // BEGINNER | INTERMEDIATE | EXPERT
  behavioralTraits: {
    impulsivityScore: number;       // 0..1, on transactions analysis
    plannerScore: number;
    spendingTimeOfDay: TimeDistribution;
    weekdayWeekendRatio: number;
  };
  preferredTone: Tone;              // FORMAL | FRIENDLY | DIRECT
  preferredChannels: Channel[];
  preferredLanguage: 'uk' | 'en';
}
```

### Behavior modeling

- Cluster аналіз (K-means) на feature vectors транзакцій
- Дозволяє тегувати користувача: "evening spender", "weekend splurger", "subscription accumulator"
- Recommendations адаптують tone та timing під кожен профіль

## 9. Background workers structure

```
src/workers/
├── transactions.worker.ts          // import, categorize
├── insights.worker.ts              // daily insights generation
├── budgets.worker.ts               // period rollover, health checks
├── forecasting.worker.ts           // nightly projection refresh
├── recommendations.worker.ts       // pipeline runner
├── rules.worker.ts                 // rule evaluation
├── notifications.worker.ts         // delivery
├── ai-memory.worker.ts             // consolidation, decay, reflection
├── embeddings.worker.ts            // backfill, refresh
└── analytics-rollups.worker.ts     // materialized view refresh
```

Деталі — у `06-BACKGROUND-JOBS.md`.

---

## Модулі, додані у Phase 4–6 (актуально на момент thesis)

| Модуль | Призначення | Ключові артефакти |
|---|---|---|
| **fx** | Курси Monobank `/bank/currency` з 5-хв кешем; конверсія між валютами через прямий курс, інверс або тріангуляцію через UAH | `FxRatesService`, `FxController` (`GET /fx/rates`, `GET /fx/convert`), AI-tool `get_fx_rate` |
| **education** | RAG над knowledge_documents (pgvector(1536)). 33 UA-статті з фінграмотності, embeddings text-embedding-3-small. | `EducationService.search()`, `EducationController` (`GET /education/search`, `GET /education/articles`), AI-tool `lookup_education`, `scripts/index-knowledge.ts` |
| **shared-kernel/credentials** | AES-256-GCM шифрування Monobank-токенів; key version у row для ротації | `CredentialVault.store/getToken/revoke` |
| **ai/verification (V2)** | Формалізована перевірка інваріанту "числа з БД, мова з LLM"; transitive grounding для calculate; retry-loop | `VerificationService`, інтегровано в `BaseAgent.run()`, метрики у `agent_turns.reasoning_trace` |
| **ai/tools/category-resolver** | Багатошарове мапування ("їжа" → "Їжа та напої"): exact → alias dict → substring → semantic (embedding cosine) | `CategoryResolverService` |
| **transactions/SpendingDecompositionService (V3)** | Причинна декомпозиція period A vs B на PRICE / VOLUME / CROSS / MIX-IN / MIX-OUT (точно адитивна) | `decomposeAggregations()` pure function + сервіс, AI-tool `explain_spending_change`, REST `/transactions/spending-decomposition`, sanity-test через `eval/v3-validation.csv` |
