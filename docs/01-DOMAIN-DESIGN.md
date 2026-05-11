# 01. Domain-Driven Design

## 1. Bounded Contexts (повна декомпозиція)

```
┌────────────────────────────────────────────────────────────────┐
│                     PFOS Domain Map                            │
├────────────────────────────────────────────────────────────────┤
│ CORE DOMAINS (тут відбувається конкурентна перевага)           │
│  • Budgeting Context                                           │
│  • Goal Planning Context                                       │
│  • Cash Flow & Forecasting Context                             │
│  • Recommendation Context                                      │
│  • AI Cognition Context (agents/tools/memory)                  │
├────────────────────────────────────────────────────────────────┤
│ SUPPORTING DOMAINS                                             │
│  • Transactions & Categorization Context (вже є)               │
│  • Insights & Anomalies Context (вже є)                        │
│  • Subscription Detection Context (вже є)                      │
│  • Notification & Channels Context                             │
│  • Personalization Context                                     │
│  • Rules Context (envelope/automation rules)                   │
├────────────────────────────────────────────────────────────────┤
│ GENERIC DOMAINS                                                │
│  • Identity & Auth (Supabase)                                  │
│  • Account Linking (Monobank)                                  │
│  • Audit & Activity Log                                        │
└────────────────────────────────────────────────────────────────┘
```

### Контекстна карта (Context Map)

```
[Identity] ──► [Accounts] ──► [Transactions] ──► [Categorization]
                                    │                  │
                                    ▼                  ▼
                              [Subscriptions]    [Insights]
                                    │                  │
                                    └──────┬───────────┘
                                           ▼
                                    [Budgeting] ◄──► [Rules]
                                           │
                                           ▼
                                       [Goals]
                                           │
                                           ▼
                                      [Cashflow]
                                           │
                                           ▼
                                  [Recommendations]
                                           │
                                           ▼
                                  [Notifications]
                                           ▲
                                           │
                                  [AI Cognition] ── shared
                                           ▲
                                           │
                                  [Personalization]
```

**Тип взаємовідносин:**
- `Transactions → Categorization` — Customer-Supplier
- `Recommendations → AI Cognition` — Conformist (cognition диктує контракт)
- `Notifications → Recommendations` — Anti-Corruption Layer (notification має власну модель)
- `Rules ↔ Budgeting` — Partnership (двостороння залежність)

## 2. Aggregate Roots (по контекстах)

### Budgeting Context
- `Budget` (root) → `BudgetPeriod` → `BudgetLine` → `BudgetAllocation`
- `EnvelopeBucket` (root) — для envelope-методу

### Goal Planning Context
- `FinancialGoal` (root) → `GoalContribution` → `GoalMilestone`
- `SavingsPlan` (root) → `PlanStep`

### Cash Flow Context
- `CashFlowProjection` (root) → `ProjectionPoint` → `ProjectionAssumption`
- `Scenario` (root) → `ScenarioVariable` → `ScenarioOutcome`

### Recommendation Context
- `Recommendation` (root) — generated по тригерах
- `RecommendationFeedback` (root) — для навчання
- `Playbook` (root) — набір reusable стратегій

### AI Cognition Context
- `AgentSession` (root) → `AgentTurn` → `ToolInvocation`
- `MemoryRecord` (root) — semantic/episodic/procedural

### Rules Context
- `Rule` (root) → `RuleCondition` → `RuleAction`
- `RuleExecution` (root) — журнал

### Personalization Context
- `UserProfile` (root) — risk tolerance, preferences, behavior model
- `UserPreference` (root) — explicit settings

## 3. Domain Events (event-driven backbone)

### Transactions
- `TransactionImported`
- `TransactionCategorized`
- `TransactionRecategorized`
- `TransactionFlaggedAsAnomaly`

### Budgeting
- `BudgetCreated`
- `BudgetPeriodStarted`
- `BudgetLineExceededWarning` (80%)
- `BudgetLineExceededCritical` (100%)
- `BudgetPeriodClosed`
- `EnvelopeRebalanced`
- `EnvelopeOverdrawn`

### Goals
- `GoalCreated`
- `GoalContributionMade`
- `GoalMilestoneReached`
- `GoalAtRisk`
- `GoalCompleted`
- `GoalDeadlineMissed`
- `GoalAbandoned`

### Cash Flow
- `CashFlowProjectionUpdated`
- `CashFlowDeficitPredicted`
- `CashFlowSurplusPredicted`
- `ScenarioCreated`
- `ScenarioSimulated`

### Recommendations
- `RecommendationGenerated`
- `RecommendationDelivered`
- `RecommendationAccepted`
- `RecommendationRejected`
- `RecommendationModified`
- `RecommendationExpired`
- `RecommendationSnoozed`

### AI
- `AgentSessionStarted`
- `AgentSessionEnded`
- `ToolInvoked`
- `ToolFailed`
- `MemoryWritten`
- `MemoryConsolidated`
- `ContextCompressed`

### Rules
- `RuleTriggered`
- `RuleExecuted`
- `RuleFailed`
- `RuleConflictDetected`

### Notifications
- `NotificationQueued`
- `NotificationDelivered`
- `NotificationFailed`
- `NotificationOpened`
- `NotificationDismissed`

## 4. Транспорт подій (event backbone)

**Архітектурне рішення:** Transactional Outbox Pattern.

```
┌──────────────────────────────────────────────────────────┐
│ 1. Domain operation (e.g., BudgetLine update)            │
│ 2. У тій же transaction:                                 │
│    a. UPDATE budget_lines                                │
│    b. INSERT INTO domain_events (...)                    │
│ 3. Окремий job (Outbox Relay) читає domain_events        │
│ 4. Job публікує в BullMQ → Redis                         │
│ 5. Subscribers консумлять з відповідних queues           │
│ 6. Job маркує event як processed                         │
└──────────────────────────────────────────────────────────┘
```

**Гарантії:**
- At-least-once delivery
- Idempotent consumers (через `event_id` як dedup key)
- Order preservation per aggregate (через `aggregate_id` як partition key)

## 5. Ключові value objects (shared kernel)

```typescript
// Money — VO з currency-aware operations
class Money {
  constructor(
    public readonly amount: bigint,    // мінорні одиниці (копійки)
    public readonly currency: Currency
  ) {}
  
  add(other: Money): Money;
  subtract(other: Money): Money;
  multiply(factor: number): Money;
  isPositive(): boolean;
  isZero(): boolean;
}

// Period — VO для часових проміжків
class Period {
  constructor(
    public readonly start: Date,
    public readonly end: Date
  ) {}
  
  contains(date: Date): boolean;
  overlaps(other: Period): boolean;
  durationDays(): number;
}

// Percentage — VO 0..100
// BurnRate — VO для budget tracking
// Confidence — VO 0..1 для AI outputs
// Probability — VO для forecasting
```

## 6. Стратегія узгодженості (consistency)

| Operation | Consistency | Justification |
|---|---|---|
| Транзакція + categorization | Strong (same TX) | Aggregate boundary |
| Categorization + budget update | Eventual | Cross-context, через event |
| Budget update + recommendation | Eventual | Cross-context |
| Goal contribution + cashflow projection | Eventual | Cross-context |
| Rule trigger + rule execution | Strong | Within Rules aggregate |
| Recommendation + notification | Eventual | Cross-context |

**Правило:** *strong consistency у межах aggregate, eventual consistency між aggregates*.

## 7. Anti-corruption layers

Де треба ACL:
- `Monobank API → Transactions` (вже є частково)
- `LLM output → Recommendations` (валідація формату, schema enforcement)
- `External knowledge base → AI Memory` (нормалізація chunks)
- `Notification Channel APIs → Notification context` (OpenAI, Telegram, Email)
