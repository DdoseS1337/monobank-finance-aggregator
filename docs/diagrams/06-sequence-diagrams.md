# Sequence Diagrams (Key Flows)

Five flows that exercise the most architecturally interesting paths.

## 1. Transaction ingest → categorization → budget update → recommendation

```mermaid
sequenceDiagram
    autonumber
    participant Mono as Monobank
    participant API as PFOS API
    participant DB as Postgres
    participant Out as OutboxPublisher
    participant Q as BullMQ
    participant CatW as CategorizationSaga
    participant BudW as BudgetLifecycleSaga
    participant RecW as RecommendationsSaga
    participant Pipe as RecommendationPipeline
    participant Notif as NotificationsSaga
    participant Channel as InAppChannel

    Mono->>API: POST /webhooks/monobank<br/>(StatementItem)
    activate API
    API->>DB: BEGIN TX
    API->>DB: INSERT transactions
    API->>DB: INSERT domain_events (transaction.imported)
    API->>DB: INSERT outbox (categorization, embeddings)
    API->>DB: COMMIT
    API-->>Mono: 200 OK
    deactivate API

    Out->>DB: SELECT outbox WHERE pending
    Out->>Q: enqueue("categorization", payload)
    Q->>CatW: process(transaction.imported)
    CatW->>DB: SELECT merchant_rules / mcc_mappings
    CatW->>DB: BEGIN TX
    CatW->>DB: UPDATE transactions SET category_id
    CatW->>DB: INSERT domain_events (transaction.categorized)
    CatW->>DB: INSERT outbox (budgets, rules, insights, subscriptions)
    CatW->>DB: COMMIT

    Out->>Q: enqueue("budgets", payload)
    Q->>BudW: process(transaction.categorized)
    BudW->>DB: find Budget+OPEN period+line for category
    BudW->>DB: BEGIN TX
    BudW->>DB: UPDATE budget_lines SET spent_amount
    BudW->>DB: IF threshold crossed →<br/>INSERT outbox (recommendations, notifications)
    BudW->>DB: COMMIT

    Out->>Q: enqueue("recommendations", payload)
    Q->>RecW: process(budget.line.exceeded.critical)
    RecW->>Pipe: run(userId)
    Pipe->>DB: ContextBuilder fetch
    Pipe->>Pipe: rule + LLM generators (parallel)
    Pipe->>Pipe: dedup + rank + top-N
    Pipe->>DB: persist recommendations + emit recommendation.generated

    Out->>Q: enqueue("notifications", payload)
    Q->>Notif: process(recommendation.generated)
    Notif->>DB: insert notifications row<br/>(quiet-hours respected)

    note over Channel: Cron @ every minute
    Channel->>DB: fetch due notifications
    Channel->>DB: mark sent
```

---

## 2. AI Chat with two-step confirmation

```mermaid
sequenceDiagram
    autonumber
    participant U as User (Web)
    participant API as PFOS API (/ai/chat)
    participant G as GuardrailsService
    participant Sup as SupervisorAgent
    participant Sub as PlannerAgent
    participant Reg as ToolRegistry
    participant Tool as CreateGoalTool
    participant Stage as StagedActionsService
    participant DB as Postgres
    participant LLM as OpenAI

    U->>API: POST /ai/chat { message: "Створи ціль на 50к" }
    activate API
    API->>G: inspect(message)
    G-->>API: { allowed: true, redactedMessage }
    API->>Sup: route(message)
    Sup-->>API: { agent: "planner", rationale: "keyword:planner" }
    API->>Sub: run(input)
    Sub->>LLM: chat.completions (tools=[get_goals, create_goal, ...])
    LLM-->>Sub: tool_calls[create_goal({name,target,...})]
    Sub->>Reg: get("create_goal")
    Reg-->>Sub: CreateGoalTool
    Sub->>Tool: execute(input, ctx)
    Tool->>Stage: stage({ actionType: "goal.create", payload, preview })
    Stage->>DB: INSERT staged_actions (status=PENDING, expiresAt=+15m)
    Stage-->>Tool: stagedAction
    Tool-->>Sub: { ok:false, error:CONFIRMATION_REQUIRED, stagedActionId, preview }
    Sub->>LLM: chat.completions (continue)
    LLM-->>Sub: final assistant message
    Sub-->>API: text + pendingConfirmations[]
    API-->>U: 200 { text, pendingConfirmations }
    deactivate API

    note over U,API: User clicks "Підтвердити" in chat UI
    U->>API: POST /ai/staged-actions/:id/confirm
    activate API
    API->>Stage: confirm(userId, stagedActionId)
    Stage->>DB: UPDATE staged_actions SET status=CONFIRMED
    Stage-->>API: action
    API->>API: StagedActionExecutor.execute("goal.create", payload)
    API->>API: GoalsService.createGoal(...)
    API->>DB: BEGIN TX
    API->>DB: INSERT goals
    API->>DB: INSERT domain_events (goal.created)
    API->>DB: INSERT outbox
    API->>DB: COMMIT
    API-->>U: 200 { ok: true, result }
    deactivate API
```

---

## 3. Cashflow forecast pipeline (Monte Carlo + deficit detection)

```mermaid
sequenceDiagram
    autonumber
    participant Cron as @Cron 02:00 UTC
    participant Sched as CashflowRefreshScheduler
    participant Pipe as ForecastPipeline
    participant Rec as RecurringDetector
    participant Hist as HistoricalBaselineService
    participant MC as MonteCarloSimulator
    participant Repo as ProjectionRepository
    participant Det as DeficitDetectorService
    participant DB as Postgres

    Cron->>Sched: nightlyForecastRefresh()
    Sched->>DB: SELECT distinct user_id FROM accounts WHERE archived IS NULL
    loop for each active user
        Sched->>Pipe: run({ userId, horizonDays:60, trials:1000 })
        Pipe->>DB: sum(account.balance)
        Pipe->>Rec: detect(userId)
        Rec->>DB: subscriptions + last 90d transactions (salary + patterns)
        Rec-->>Pipe: RecurringFlow[]
        Pipe->>Hist: compute(userId, 90)
        Hist->>DB: transactions WHERE date >= now-90d AND NOT recurring
        Hist-->>Pipe: DailyDistribution{ meanByDow, stdDaily, ... }
        Pipe->>MC: simulate(starting, 60, dist, recurring, 1000, seed?)
        MC-->>Pipe: SimulationOutput{ perDay[60], deficitProbability }
        Pipe->>Repo: saveAsLatest(projection)
        Repo->>DB: BEGIN TX<br/>UPDATE WHERE isLatest=true SET isLatest=false<br/>INSERT cashflow_projections + projection_points<br/>INSERT outbox(cashflow.projection.updated)<br/>COMMIT
        Pipe->>Det: scanAndFlag(projection)
        Det->>DB: INSERT deficit_predictions + outbox(cashflow.deficit.predicted)
    end
```

---

## 4. Recommendation pipeline (event-driven path)

```mermaid
sequenceDiagram
    autonumber
    participant Out as OutboxPublisher
    participant Q as BullMQ
    participant Saga as RecommendationsSaga
    participant Pipe as RecommendationPipeline
    participant Ctx as ContextBuilder
    participant Rules as RuleBasedGenerator
    participant Llm as LlmGenerator
    participant Mem as MemoryService
    participant Embed as EmbeddingService
    participant Dedup as Deduplicator
    participant Rank as RecommendationRanker
    participant Repo as RecommendationRepository
    participant DB as Postgres

    Out->>Q: enqueue("recommendations", cashflow.deficit.predicted)
    Q->>Saga: process(payload)
    Saga->>Pipe: run(userId)

    Pipe->>Ctx: build(userId)
    Ctx->>DB: parallel fetch: accounts, budgets, goals,<br/>cashflow, subscriptions, recent spend
    Ctx-->>Pipe: UserContext

    par
        Pipe->>Rules: generate(ctx)
        Rules-->>Pipe: ruleCandidates[]
    and
        Pipe->>Llm: generate(ctx)
        Llm->>Mem: recall("preferences", topK=8)
        Mem-->>Llm: SEMANTIC records
        Llm->>OpenAI: chat (system+user, JSON-schema)
        OpenAI-->>Llm: { recommendations: [...] }
        Llm-->>Pipe: llmCandidates[]
    end

    Pipe->>Embed: embedBatch(candidate.explanation[])
    Embed-->>Pipe: vectors[]
    Pipe->>Dedup: dedup(userId, candidates+embeddings)
    Dedup->>Repo: findSimilarRecent(userId, vector, 30d)
    Repo-->>Dedup: similar[] with status
    Dedup-->>Pipe: { kept, skipped }

    Pipe->>Repo: acceptedCentroid(userId)
    Repo-->>Pipe: centroid

    loop for each kept candidate
        Pipe->>Rank: rank(rec, ctx, { maxSim, userFit })
        Rank-->>Pipe: RankingScore
    end

    Pipe->>Pipe: sort by score desc, take top-6
    Pipe->>Repo: save + emit recommendation.generated
```

---

## 5. Memory consolidation (nightly LLM reflection)

```mermaid
sequenceDiagram
    autonumber
    participant Cron as @Cron 03:00 UTC
    participant Sched as MemoryMaintenanceScheduler
    participant Cons as MemoryConsolidationService
    participant Mem as MemoryRepository
    participant Embed as EmbeddingService
    participant LLM as OpenAI
    participant DB as Postgres

    Cron->>Sched: consolidate()
    Sched->>DB: SELECT distinct user_id FROM memory_records<br/>WHERE superseded_by IS NULL
    loop per user
        Sched->>Cons: consolidateForUser(userId)
        Cons->>Mem: episodicSince(userId, 7d, 100)
        Mem-->>Cons: MemoryRecord[]
        Cons->>LLM: chat (system + episodic context, JSON-schema)
        LLM-->>Cons: { semantic_facts: [{ content, importance }] }
        loop for each fact
            Cons->>Embed: embed(fact.content)
            Embed-->>Cons: vector
            Cons->>Mem: save(SEMANTIC record)
            Mem->>DB: INSERT memory_records + outbox(memory.written)
        end
        Cons->>DB: emit memory.consolidated event
    end
```

## 4. AI chat with V2 verification layer

Цей sequence — ключова **наукова новизна** магістерської. Кожне число у
фінальній відповіді LLM трасується назад до якогось tool-output; якщо
число "вигадане" — система автоматично робить retry з корекційним
system-prompt.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Chat as AiChatService
    participant Guard as GuardrailsService
    participant Sup as SupervisorAgent
    participant Agent as Sub-agent<br/>(Analyst / Planner / Forecaster)
    participant LLM as OpenAI<br/>chat.completions
    participant Tools as ToolRegistry
    participant V as VerificationService<br/>(V2)
    participant DB as agent_turns<br/>(reasoning_trace)

    User->>Chat: POST /ai/chat { message }
    Chat->>Guard: inspect(message)
    Guard-->>Chat: { allowed, redactedMessage, flags }
    Chat->>Sup: route(message)
    Sup-->>Chat: { agent: "analyst", rationale }
    Chat->>Agent: run({ userId, sessionId, userMessage, history })

    loop ReAct ≤ MAX_TOOL_LOOPS (10)
        Agent->>LLM: chat(messages, tools)
        LLM-->>Agent: completion (message + tool_calls?)
        alt LLM requested tool calls
            par parallel tool execution
                Agent->>Tools: execute(toolA, args)
                Tools-->>Agent: { ok, data }
            and
                Agent->>Tools: execute(toolB, args)
                Tools-->>Agent: { ok, data }
            end
            Agent->>LLM: append tool results to messages
        else LLM returned final text
            Agent->>V: verifyResponse(text, toolOutputs, toolCalls, userMessage)
            V->>V: extract numeric claims (currency, %, plain)
            V->>V: flatten tool outputs into trusted set
            V->>V: transitive grounding for calculate tool
            V->>V: also trust user-stated numbers from prompt
            alt unverified > 0  AND  retry budget left
                V-->>Agent: { verified, unverified, retried=false }
                Agent->>DB: persist verification_retry log
                Agent->>LLM: append VERIFICATION FAILURE system msg<br/>with offending claims
                Note over Agent,LLM: continue loop (1 retry budget)
            else everything verified
                V-->>Agent: { verified=N, total=N, retried }
                Agent->>DB: persist verification_report
                Agent-->>Chat: { text, verification, toolCalls }
                Chat-->>User: response with ✓ "Перевірено N/N" badge
            end
        end
    end
```

Ключові інваріанти, що формалізує цей механізм:

1. **Provenance**: ∀ numeric claim c ∈ response, ∃ tool-call t такий, що c ∈ output(t).
2. **Transitive grounding**: для t = calculate(expr), всі літерали з expr самі мають
   бути ∈ output(t') для якогось іншого t' ≠ calculate, або належати множині чисел,
   які користувач явно вказав у запиті.
3. **Retry safety**: ≤ 1 retry за turn, щоб уникнути нескінченного циклу
   "вигадав → переписав → знов вигадав".

## 5. Causal decomposition (V3) — explain spending change

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Chat as AiChatService
    participant Analyst as AnalystAgent
    participant Tool as ExplainSpendingChangeTool
    participant Decomp as SpendingDecompositionService
    participant DB as transactions
    participant V as VerificationService

    User->>Chat: "Чому я витратив більше в листопаді ніж у жовтні?"
    Chat->>Analyst: route → Analyst
    Analyst->>Tool: explain_spending_change({fromA, toA, fromB, toB, groupBy})
    Tool->>Decomp: decompose({userId, periodA, periodB})
    Decomp->>DB: SELECT amount, merchant, category WHERE period=A
    DB-->>Decomp: aggA: RawAggregation[]
    Decomp->>DB: SELECT amount, merchant, category WHERE period=B
    DB-->>Decomp: aggB: RawAggregation[]
    Decomp->>Decomp: decomposeAggregations({aggA, aggB})
    Note right of Decomp: For each merchant in both:<br/>price = (avgB-avgA)*countA<br/>volume = (countB-countA)*avgA<br/>cross = (avgB-avgA)*(countB-countA)<br/>Mix-in: spendB for new<br/>Mix-out: -spendA for dropped
    Decomp-->>Tool: { totals: {price, volume, cross, mixIn, mixOut}, items[] }
    Tool-->>Analyst: tool result (verified by construction)
    Analyst->>Analyst: compose answer citing named effects
    Analyst->>V: verifyResponse(text, toolOutputs)
    V-->>Analyst: ✓ all numbers grounded in decomposition output
    Analyst-->>User: "Витрати зросли на 2400 грн: +1500 нові мерчанти,<br/>+800 зростання середнього чека в АТБ, -300 менше покупок у Сільпо"
```

Властивість, яку V3 гарантує:

**Δspend ≡ priceEffect + volumeEffect + crossEffect + mixInEffect + mixOutEffect** (точно)

Перевірено на 6 синтетичних сценаріях з ground truth — див. `eval/v3-validation.csv`.
