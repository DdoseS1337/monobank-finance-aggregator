# 10. Roadmap реалізації

## Огляд

```
Phase 1: Foundation         (1-2 тижні)   ⚙️ Backbone
Phase 2: Management Core    (3-4 тижні)   💼 Бюджети + Цілі + Rules
Phase 3: Forecasting        (2-3 тижні)   🔮 Прогнози + Сценарії
Phase 4: Intelligence       (3-4 тижні)   🧠 AI Multi-agent + Memory + Recs
Phase 5: Orchestration      (2 тижні)     🔔 Notifications + Personalization
Phase 6: UX                 (2-3 тижні)   🎨 Frontend
Phase 7: Polish & Eval      (2 тижні)     📊 Метрики + Документація

Total: 15-20 тижнів (3.5-5 місяців)
```

## Phase 1 — Foundation (1–2 тижні)

**Мета:** покласти event-driven backbone, на якому буде stand усе інше.

### Tasks
- [ ] Setup Prisma migrations: `domain_events`, `outbox`, `staged_actions`
- [ ] Implement `DomainEventBus` service (NestJS)
- [ ] Implement `OutboxPublisher` worker
- [ ] Setup BullMQ queues skeleton
- [ ] Setup base test infrastructure (unit + integration)
- [ ] Refactor existing modules to emit events:
  - `transactions` → `TransactionImported`, `TransactionCategorized`
  - `subscriptions` → `SubscriptionDetected`
  - `insights` → `InsightGenerated`, `AnomalyDetected`
- [ ] Setup observability skeleton (logs, metrics)
- [ ] Document Domain Events catalog (формальний)

### Deliverables
- Working event bus
- 5+ existing events emitted
- Outbox publishing to queues
- Базова обсервабіліті

**Definition of done:** Можна підписатись на event і отримати його в worker з гарантованою доставкою.

---

## Phase 2 — Management Core (3–4 тижні)

**Мета:** реалізувати найфундаментальніші management фічі.

### 2.1. Budgeting Module (1 тиждень)
- [ ] Schema: `budgets`, `budget_periods`, `budget_lines`, `envelopes`, `envelope_movements`
- [ ] Domain entities: `Budget`, `BudgetPeriod`, `BudgetLine`, `EnvelopeBucket`
- [ ] Application: Create/Adjust/Archive budget commands
- [ ] Saga: `BudgetPeriodLifecycleSaga`
- [ ] Worker: budget health evaluator
- [ ] API endpoints
- [ ] Unit tests + integration tests

### 2.2. Goals Module (1 тиждень)
- [ ] Schema: `goals`, `goal_contributions`, `goal_milestones`, `savings_plans`
- [ ] Domain entities з `feasibilityScore` placeholder
- [ ] CRUD + contribution logic
- [ ] Domain events: `GoalCreated`, `GoalContributionMade`, `GoalAtRisk`, `GoalCompleted`
- [ ] API endpoints

### 2.3. Rules Module (1 тиждень)
- [ ] Schema: `rules`, `rule_executions`
- [ ] AST evaluator (sandbox)
- [ ] Rule trigger dispatcher (event-driven)
- [ ] Predefined templates (10 шт.)
- [ ] Conflict detection
- [ ] API + UI builder placeholder

### 2.4. Integration (0.5 тижня)
- [ ] `TransactionCategorized` → updates `BudgetLine.spentAmount`
- [ ] `BudgetLineExceeded` events emit
- [ ] Rule trigger: salary → auto-allocate to envelopes/goals

### Deliverables
- Working budgeting (2 methods: category + envelope)
- Working goals (без feasibility ще)
- Working rule engine з 10 templates
- E2E flow: транзакція → categorization → budget update → rule evaluation

**Definition of done:** User може створити бюджет, ціль, rule "на зарплату → 20% у ціль", і це працює end-to-end.

---

## Phase 3 — Forecasting & Simulation (2–3 тижні)

### 3.1. Cashflow Forecasting (1.5 тижня)
- [ ] Schema: `cashflow_projections`, `projection_points`, `deficit_predictions`
- [ ] Recurring detector (з existing subscriptions + salary)
- [ ] Time-series base forecast (Prophet або просте averaging для start)
- [ ] Categorical decomposition
- [ ] Monte Carlo simulator (N=1000)
- [ ] LLM-based qualitative adjuster (proмpt-based)
- [ ] Confidence intervals (P10/P50/P90)
- [ ] Worker: nightly projection refresh
- [ ] Deficit detection logic
- [ ] API endpoints

### 3.2. Goal Feasibility (0.5 тижня)
- [ ] Monte Carlo simulator для feasibility
- [ ] Worker: nightly feasibility recalc
- [ ] Goal events: `GoalAtRisk` based on feasibility threshold

### 3.3. Scenario Sandbox (1 тиждень)
- [ ] Schema: `scenarios`, `scenario_outcomes`
- [ ] Scenario simulation engine
- [ ] Diff-based outcome computation (vs baseline)
- [ ] API endpoints
- [ ] Frontend page (basic)

### Deliverables
- 30/60/90-day projections з confidence bands
- Deficit detection
- Goal feasibility scores
- What-if scenarios

**Definition of done:** User бачить прогноз cashflow на 60 днів з визначеним dip-моментом, може запустити "what-if додати ціль 10к" і побачити impact.

---

## Phase 4 — Intelligence (3–4 тижні)

### 4.1. Multi-agent refactor (1.5 тижня)
- [ ] Refactor existing single-agent → LangGraph supervisor
- [ ] Implement 5 sub-agents: Analyst, Coach, Planner, Forecaster, Auditor
- [ ] Tool catalog refactor
- [ ] Per-agent tool subsets
- [ ] Two-step confirmation для всіх mutation tools
- [ ] `staged_actions` table flow
- [ ] Cost tracking per session/turn

### 4.2. AI Memory Layer (1 тиждень)
- [ ] Schema: `memory_records` (з pgvector)
- [ ] Memory service: write / recall / consolidate
- [ ] Working memory (за-сесійно)
- [ ] Episodic memory (events)
- [ ] Semantic memory (facts)
- [ ] Worker: nightly consolidation
- [ ] Worker: decay / pruning
- [ ] Integration з sub-agents

### 4.3. Recommendation Engine (1.5 тижня)
- [ ] Schema: `recommendations`, `recommendation_actions`, `recommendation_feedback`, `playbooks`
- [ ] Trigger sources (events + cron)
- [ ] Context Builder
- [ ] Generators:
  - Rule-based generator
  - LLM-based generator
  - (ML-based generator — optional)
- [ ] Aggregator
- [ ] MCDM Ranker з ваговою матрицею
- [ ] Deduplication (vector similarity)
- [ ] Cooldown logic
- [ ] Personalization templating
- [ ] Worker pipeline

### Deliverables
- Multi-agent з 5 specialized agents
- Layered memory з consolidation
- Working recommendation pipeline
- Recommendation Inbox з accept/reject loop

**Definition of done:** Виникає `BudgetLineExceeded` → pipeline генерує 3 recommendations → ранжує → видаляє duplicate з прийнятими раніше → шле в notifications.

---

## Phase 5 — Orchestration (2 тижні)

### 5.1. Notification Orchestration (1 тиждень)
- [ ] Schema: `notifications`, `notification_receipts`
- [ ] Channels: in-app, email (mandatory)
- [ ] Channels: push, telegram (optional)
- [ ] Channel selector
- [ ] Throttler
- [ ] Deduplicator
- [ ] Quiet hours respect
- [ ] Importance-based routing
- [ ] Receipt tracking
- [ ] Channel preference learning

### 5.2. Personalization Layer (1 тиждень)
- [ ] Schema: `user_profiles`, `user_preferences`
- [ ] Profile management UI
- [ ] Behavior modeling (simple — clustering на transaction features)
- [ ] Embedding-based behavior vector
- [ ] Integration з recommendation templating
- [ ] Integration з AI agent tone

### Deliverables
- Working multi-channel notifications
- Personalization context applied to recommendations
- Behavior-aware AI responses

**Definition of done:** Recommendation надсилається в правильний канал в правильному tone з правильною мовою для конкретного user.

---

## Phase 6 — UX (2–3 тижні)

### 6.1. Core pages (2 тижні)
- [ ] `/dashboard` з Health Score
- [ ] `/budgets` (list) + `/budgets/[id]` (з envelope ladder)
- [ ] `/budgets/new` (creator з method selection)
- [ ] `/goals` + `/goals/[id]` (з progress + feasibility)
- [ ] `/cashflow` (chart + deficits)
- [ ] `/scenarios` (sandbox)
- [ ] `/recommendations` (Inbox)
- [ ] `/rules` (basic builder)

### 6.2. AI Chat refactor (0.5 тижня)
- [ ] Action chips
- [ ] Two-step confirmation dialog
- [ ] Tool call timeline (transparency)
- [ ] Explanation panels

### 6.3. Polish (0.5 тижня)
- [ ] Mobile responsiveness
- [ ] Real-time updates (Supabase)
- [ ] Animations (view transitions)
- [ ] Accessibility audit

### Deliverables
- Full UI з усіма ключовими flows
- AI Chat з actions
- Real-time recommendations feed

**Definition of done:** Можна повністю користуватись системою через UI без curl.

---

## Phase 7 — Polish & Evaluation (2 тижні)

### 7.1. AI Evaluation (1 тиждень)
- [ ] RAGAS evaluation для RAG pipeline
- [ ] Recommendation acceptance rate (synthetic users)
- [ ] Forecasting MAPE на тестовому датасеті
- [ ] Tool call success rate
- [ ] Hallucination rate measurement
- [ ] Latency benchmarks

### 7.2. Performance tuning
- [ ] Database indexes
- [ ] Materialized views refresh strategy
- [ ] Caching layer (Redis)
- [ ] AI cost optimization (tool selection, prompt caching)

### 7.3. Documentation для роботи (1 тиждень)
- [ ] C4 diagrams (Context, Container, Component)
- [ ] UML class diagrams (per context)
- [ ] Sequence diagrams (5+ ключових flows)
- [ ] State diagrams (Budget, Goal, Recommendation, Agent FSM)
- [ ] BPMN-style activity diagrams (3+)
- [ ] Deployment diagram
- [ ] Повна ER-діаграма
- [ ] OpenAPI export
- [ ] AI prompts catalog
- [ ] Demo recording

### Deliverables
- Eval report з метриками
- Повний набір діаграм
- API documentation
- Demo video

**Definition of done:** Робота має повну документацію, метрики, діаграми. Готова до захисту.

---

## Дипломний deadline checklist

Орієнтовно за 2-3 тижні до захисту:

- [ ] Розділ 1 — Огляд написаний
- [ ] Розділ 2 — Теоретичні основи
- [ ] Розділ 3 — Проєктування з усіма діаграмами
- [ ] Розділ 4 — Реалізація з code listings
- [ ] Розділ 5 — Результати та метрики
- [ ] Розділ 6 (якщо треба) — Економіка
- [ ] Розділ 7 (якщо треба) — Охорона праці
- [ ] Висновки
- [ ] Список джерел (50-80)
- [ ] Додатки
- [ ] Доповідь (15-20 хв)
- [ ] Презентація (15-20 слайдів)
- [ ] Live demo підготовлений (3-5 sample scenarios)
- [ ] Backup demo (видеозапис на випадок проблем)

## Розподіл за пріоритетом для критичних cases

Якщо часу мало — drop у такому порядку:

1. **Drop первими (lower impact на захист):**
   - Push notifications (залишити email + in-app)
   - Telegram bot
   - PWA / offline
   - Voice interface
   - ML-based generator у recommendations

2. **Drop other (medium impact):**
   - Behavior modeling (clustering)
   - Knowledge base + RAG (зберегти лише existing AI chat)
   - Procedural memory (залишити semantic + episodic)

3. **Не дропати ніколи:**
   - Multi-agent core
   - Memory (semantic + episodic)
   - Recommendation pipeline (rule + LLM)
   - Budgeting + Goals + Cashflow
   - Rule engine
   - Event-driven backbone
   - C4 + UML діаграми

## Параллелізм робіт

Що можна робити паралельно:

| Можна паралельно | Причина |
|---|---|
| Phase 2.1 (Budgets) + 2.2 (Goals) | Незалежні домени |
| Phase 4.1 (Multi-agent) + Phase 6.1 (UI) | Backend + Frontend |
| Phase 5 (Notifications) + Phase 6 (UX) | Незалежні |
| Документація + Phase 7 (Eval) | Можна паралельно |

## Ризики та митигація

| Ризик | Митигація |
|---|---|
| Monobank API rate limits | Caching, staggered cron |
| OpenAI cost explosion | Tool budgets, cheap model для routing, prompt caching |
| LLM hallucinations | Schema-enforced output, claim verification |
| Складність multi-agent | Start with 3 agents, scale up |
| Performance issues | Indexes, materialized views, profiling early |
| Time overrun | Strict tier-based prioritization, drop tier 3+ |
