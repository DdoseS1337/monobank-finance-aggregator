# ER Diagram

Logical schema generated from `prisma/schema.prisma`. Grouped by bounded context.

> Mermaid renders large ER diagrams slowly; if you need it for the thesis, generate a PNG export with the [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli) or [mermaid.live](https://mermaid.live).

## Identity / Accounts / Transactions

```mermaid
erDiagram
    USERS {
      uuid id PK
      string email
      timestamp createdAt
    }

    ACCOUNTS {
      uuid id PK
      uuid userId FK
      string provider
      string externalId
      string name
      char3 currency
      decimal balance
      enum type
      jsonb metadata
      timestamp linkedAt
      timestamp archivedAt
    }

    TRANSACTIONS {
      uuid id PK
      uuid userId FK
      uuid accountId FK
      string externalId
      decimal amount
      char3 currency
      enum type
      enum status
      string merchantName
      int mccCode
      uuid categoryId FK
      vector1536 embedding
      timestamp transactionDate
    }

    CATEGORIES {
      uuid id PK
      uuid parentId FK
      string slug
      string name
      bool isSystem
    }

    MCC_MAPPINGS {
      int mccCode PK
      uuid categoryId FK
      decimal weight
    }

    MERCHANT_RULES {
      uuid id PK
      string pattern
      string matchType
      string matchField
      uuid categoryId FK
      int priority
      bool enabled
    }

    USERS ||--o{ ACCOUNTS : owns
    USERS ||--o{ TRANSACTIONS : owns
    ACCOUNTS ||--o{ TRANSACTIONS : holds
    CATEGORIES ||--o{ TRANSACTIONS : labels
    CATEGORIES ||--o{ CATEGORIES : parent
    CATEGORIES ||--o{ MCC_MAPPINGS : maps
    CATEGORIES ||--o{ MERCHANT_RULES : maps
```

## Budgeting

```mermaid
erDiagram
    BUDGETS {
      uuid id PK
      uuid userId FK
      string name
      enum method
      enum cadence
      char3 baseCurrency
      enum status
    }
    BUDGET_PERIODS {
      uuid id PK
      uuid budgetId FK
      date periodStart
      date periodEnd
      enum status
    }
    BUDGET_LINES {
      uuid id PK
      uuid budgetPeriodId FK
      uuid categoryId FK
      decimal plannedAmount
      decimal spentAmount
      int thresholdPct
      enum status
    }
    ENVELOPES {
      uuid id PK
      uuid userId FK
      decimal balance
      decimal targetBalance
    }
    ENVELOPE_MOVEMENTS {
      uuid id PK
      uuid envelopeId FK
      decimal amount
      enum direction
      string sourceType
      uuid relatedEnvelopeId FK
    }

    BUDGETS ||--o{ BUDGET_PERIODS : has
    BUDGET_PERIODS ||--o{ BUDGET_LINES : has
    ENVELOPES ||--o{ ENVELOPE_MOVEMENTS : tracks
```

## Goals & Cashflow

```mermaid
erDiagram
    GOALS {
      uuid id PK
      uuid userId FK
      enum type
      decimal targetAmount
      decimal currentAmount
      char3 baseCurrency
      date deadline
      int priority
      enum status
      decimal feasibilityScore
    }
    GOAL_CONTRIBUTIONS {
      uuid id PK
      uuid goalId FK
      decimal amount
      string sourceType
      timestamp madeAt
    }
    GOAL_MILESTONES {
      uuid goalId FK
      smallint thresholdPct
      timestamp reachedAt
    }

    CASHFLOW_PROJECTIONS {
      uuid id PK
      uuid userId FK
      int horizonDays
      string modelVersion
      decimal confidenceScore
      bool isLatest
      jsonb payload
    }
    PROJECTION_POINTS {
      uuid id PK
      uuid projectionId FK
      date day
      decimal balanceP10
      decimal balanceP50
      decimal balanceP90
      bool hasDeficitRisk
    }
    SCENARIOS {
      uuid id PK
      uuid userId FK
      uuid baselineProjectionId FK
      jsonb variables
      jsonb outcomes
    }
    DEFICIT_PREDICTIONS {
      uuid id PK
      uuid userId FK
      uuid projectionId FK
      date predictedFor
      decimal estimatedAmount
      decimal confidence
    }

    GOALS ||--o{ GOAL_CONTRIBUTIONS : has
    GOALS ||--o{ GOAL_MILESTONES : has
    CASHFLOW_PROJECTIONS ||--o{ PROJECTION_POINTS : has
    CASHFLOW_PROJECTIONS ||--o{ DEFICIT_PREDICTIONS : flags
    CASHFLOW_PROJECTIONS ||--o{ SCENARIOS : baseline
```

## Recommendations & Notifications

```mermaid
erDiagram
    RECOMMENDATIONS {
      uuid id PK
      uuid userId FK
      enum kind
      smallint priority
      string generatedBy
      enum status
      jsonb payload
      string explanation
      jsonb expectedImpact
      vector1536 embedding
      decimal rankingScore
      jsonb rankingBreakdown
    }
    RECOMMENDATION_ACTIONS {
      uuid id PK
      uuid recommendationId FK
      string actionType
      jsonb params
    }
    RECOMMENDATION_FEEDBACK {
      uuid id PK
      uuid recommendationId FK
      uuid userId FK
      string decision
      jsonb modifications
    }

    NOTIFICATIONS {
      uuid id PK
      uuid userId FK
      string channel
      string kind
      string severity
      jsonb payload
      timestamp scheduledFor
      string status
      uuid recommendationId FK
    }
    NOTIFICATION_RECEIPTS {
      uuid id PK
      uuid notificationId FK
      timestamp openedAt
      timestamp clickedAt
    }

    RECOMMENDATIONS ||--o{ RECOMMENDATION_ACTIONS : has
    RECOMMENDATIONS ||--o{ RECOMMENDATION_FEEDBACK : has
    RECOMMENDATIONS ||--o{ NOTIFICATIONS : triggers
    NOTIFICATIONS ||--o{ NOTIFICATION_RECEIPTS : tracks
```

## AI Cognition

```mermaid
erDiagram
    AGENT_SESSIONS {
      uuid id PK
      uuid userId FK
      string agentType
      timestamp startedAt
      timestamp endedAt
      decimal totalCostUsd
      int totalTokensIn
      int totalTokensOut
    }
    AGENT_TURNS {
      uuid id PK
      uuid sessionId FK
      int turnNumber
      string role
      string content
      jsonb toolCalls
      int latencyMs
      decimal costUsd
    }
    TOOL_INVOCATIONS {
      uuid id PK
      uuid turnId FK
      string toolName
      jsonb input
      jsonb output
      string status
      int durationMs
    }
    MEMORY_RECORDS {
      uuid id PK
      uuid userId FK
      enum kind
      string content
      vector1536 embedding
      decimal importanceScore
      decimal decayFactor
      uuid supersededById FK
    }
    KNOWLEDGE_DOCUMENTS {
      uuid id PK
      string source
      string title
      string content
      vector1536 embedding
      char2 lang
    }
    STAGED_ACTIONS {
      uuid id PK
      uuid userId FK
      string actionType
      jsonb payload
      jsonb preview
      string status
      timestamp expiresAt
    }

    AGENT_SESSIONS ||--o{ AGENT_TURNS : has
    AGENT_TURNS ||--o{ TOOL_INVOCATIONS : has
    MEMORY_RECORDS ||--o{ MEMORY_RECORDS : supersedes
```

## Events / Outbox / Rules / Personalization

```mermaid
erDiagram
    DOMAIN_EVENTS {
      uuid id PK
      string aggregateType
      uuid aggregateId
      string eventType
      jsonb payload
      timestamp occurredAt
      timestamp processedAt
      uuid userId
    }
    OUTBOX {
      uuid id PK
      uuid eventId FK
      string destination
      string status
      smallint attempts
      timestamp lastAttemptedAt
    }

    RULES {
      uuid id PK
      uuid userId FK
      string name
      jsonb triggerSpec
      jsonb conditionAst
      jsonb actions
      int priority
      int cooldownSeconds
      bool enabled
    }
    RULE_EXECUTIONS {
      uuid id PK
      uuid ruleId FK
      timestamp triggeredAt
      bool evaluationResult
      string status
      int durationMs
    }

    USER_PROFILES {
      uuid userId PK,FK
      string riskTolerance
      string financialLiteracyLevel
      jsonb behavioralTraits
      string preferredTone
      string[] preferredChannels
      char2 preferredLanguage
      jsonb quietHours
    }
    USER_PREFERENCES {
      uuid id PK
      uuid userId FK
      string domain
      string key
      jsonb value
      string source
    }

    DOMAIN_EVENTS ||--o{ OUTBOX : routes
    RULES ||--o{ RULE_EXECUTIONS : log
```

---

## Key indices

| Table | Index | Reason |
|---|---|---|
| `transactions` | `(userId, transactionDate DESC)` + `(categoryId)` + partial `(userId, isAnomaly)` | feed, analytics, anomaly UI |
| `outbox` | `(status, createdAt)` | publisher draining loop |
| `domain_events` | `(processedAt)` partial | fast lookup of unprocessed |
| `recommendations` | `(userId, status, generatedAt DESC)` | inbox query |
| `memory_records` | HNSW(`embedding`) + `(userId, kind)` | vector recall |
| `knowledge_documents` | HNSW(`embedding`) + GIN FTS | hybrid retrieval |
| `notifications` | partial `(userId, dedupKey)` + `(scheduledFor, status)` | dedup, deliverDue |
| `staged_actions` | `(userId, status, expiresAt)` partial | active confirmations |
