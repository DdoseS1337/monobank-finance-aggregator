# Personal Financial Operating System (PFOS)

**Магістерська робота**: Розробка інтелектуальної системи аналітики та
управління персональними фінансами на основі мультиагентної AI-архітектури.

---

## Що це

Веб-застосунок, який автоматично збирає транзакції з Monobank, нормалізує
і категоризує їх, рахує бюджети/цілі/cashflow, та дає
**природномовний інтерфейс** через мультиагентний LLM-конвеєр —
з формальною верифікованістю кожного числа у відповідях.

Архітектура побудована довкола двох взаємодоповнюючих наукових
контрибуцій:

| Контрибуція | Що дає | Файли |
|---|---|---|
| **V2 — Verification Layer** | Формалізує і автоматично перевіряє інваріант "числа з БД, мова з LLM". Парсить numeric claims з відповіді LLM, transitively grounds їх до tool-call results, запускає retry-loop при невідповідності. | [`backend/src/modules/ai/verification`](backend/src/modules/ai/verification) |
| **V3 — Causal Decomposition** | Адаптує price/volume/mix decomposition (стандартна техніка фін-аналізу) до персональних фінансів. Точно адитивна формула: Δspend = price + volume + cross + mix⁺ + mix⁻. AI-агент використовує її для пояснень "чому витрати зросли". | [`spending-decomposition.service.ts`](backend/src/modules/transactions/application/spending-decomposition.service.ts) |

Плюс **RAG над UA фінансовою грамотністю** (33 статті: ОВДП, ФОП, єОселя,
складний відсоток, поведінкові пастки), щоб агент відповідав з джерелом,
а не галюцинаціями.

---

## Демонстрація

```text
Користувач:  «Створи мені бюджет на місяць: зарплата 2500 USD,
              їжа 50000 грн, квартира 650 USD, паркінг 1300 SEK»

Агент:       → get_categories                (catalog: 80+ категорій)
             → get_fx_rate USD→UAH 2500       (109 674.13)
             → get_fx_rate USD→UAH 650        (28 487.28)
             → get_fx_rate SEK→UAH 1300       (6 230.25)
             → calculate "50000 + 28487 + 6230"  (84 717.28)
             → create_budget                  (staged for confirmation)
             "Я підготував бюджет: …"
             ✓ Перевірено 7/7 числових тверджень
             [ Confirm ] [ Cancel ]
```

Кожне число у відповіді трасується до tool-output, verification layer це
гарантує. Без verifier-а агент часто множив на вигаданий курс і
помилявся — emprically доведено на golden-датасеті з 50 запитів.

---

## Структура репозиторію

```
diploma2/
├── backend/                 NestJS 11 API (DDD-style bounded contexts)
│   ├── src/modules/
│   │   ├── ai/              Multi-agent (Supervisor + Analyst/Planner/
│   │   │                    Forecaster), tools, V2 verification, memory
│   │   ├── transactions/    Monobank import + categorization + V3 decomp
│   │   ├── categorization/  MCC + merchant-rules + fallback (хибридне)
│   │   ├── budgeting/       Budgets + lines + hierarchical roll-up
│   │   ├── goals/           SAVING / DEBT / INVESTMENT goals + feasibility
│   │   ├── cashflow/        Monte Carlo projection + scenarios
│   │   ├── recommendations/ Rule-based + LLM generators + feedback
│   │   ├── rules/           User AST rule engine
│   │   ├── education/       RAG over knowledge_documents (pgvector)
│   │   ├── fx/              Monobank /bank/currency rates + caching
│   │   ├── personalization/ User profile (risk, literacy, tone)
│   │   ├── notifications/   Multi-channel orchestration
│   │   └── accounts/        Linked accounts (Monobank, manual)
│   ├── prisma/              schema.prisma + migrations + seed
│   ├── scripts/             eval, fix-tx, kb-index, render-diagrams
│   └── workers/             BullMQ workers (outbox, categorization, etc)
│
├── frontend/                Next.js 16 (App Router) + React 19 + Tailwind 4
│   └── src/app/dashboard/
│       ├── page.tsx         Огляд (KPI + recommendations preview)
│       ├── accounts/        Підключення Monobank
│       ├── transactions/    Список з фільтрами + hold-бейдж
│       ├── spending/        Donut по категоріях + drill-down
│       ├── spending/compare/ V3 — price/volume/mix decomposition UI
│       ├── budgets/         CRUD + recompute spentAmount from history
│       ├── goals/           Goals з feasibility chart
│       ├── cashflow/        Fan-chart P10/P50/P90 + deficit alerts
│       ├── scenarios/       What-if simulator
│       ├── recommendations/ Inbox з accept/reject/snooze
│       ├── rules/           Rule builder
│       ├── library/         RAG-каталог фінграмотності + пошук
│       ├── assistant/       AI chat з sessions sidebar + verification badge
│       ├── notifications/   Inbox
│       └── settings/        UserProfile, tone, риск-толеранс
│
├── docs/                    Архітектурна документація
│   ├── 00–10 ………………………       Концепція, DDD, модулі, AI, БД, ролі
│   ├── diagrams/            Mermaid: C4, sequence, state, ER (33 діаграми)
│   ├── prompts/             AI prompts catalog
│   └── thesis-evaluation-guide.md  Гайд "як аналізувати результати"
│
├── eval/                    Емпіричні тести для розділу "Результати"
│   ├── queries.csv          Golden dataset (50 запитів × 5 типів)
│   ├── analyze.py           Python report генератор (pandas + matplotlib)
│   ├── results-*.csv        Прогони з/без verifier-а
│   ├── v3-validation.csv    Синтетична валідація декомпозиції
│   └── chart-*.png          Графіки для thesis
│
└── scripts/                 render-diagrams.mjs (Mermaid → SVG+PNG)
```

---

## Що під капотом

### Бекенд

- **NestJS 11** з DDD-структурою кожного модуля: `domain/`, `application/`,
  `infrastructure/`, `presentation/`.
- **Prisma + PostgreSQL** (Supabase) з pgvector розширенням для embeddings.
- **BullMQ + Redis** — outbox pattern + фонові саги (categorization,
  budget rollup, subscription detection, memory consolidation/decay).
- **Domain Events** — формальний каталог у [docs/01-DOMAIN-DESIGN.md](docs/01-DOMAIN-DESIGN.md).
- **AES-256-GCM** шифрування Monobank-токенів через `CredentialVault` з
  ротацією ключа через `keyVersion`.
- **Supabase Auth** з гібридним guard: HS256 (legacy) або ES256/RS256
  (нові asymmetric keys) через JWT header detection.
- **Outbox-pattern** для гарантованої доставки domain events у sagas.

### AI-агентний конвеєр

```
User → GuardrailsService (PII redaction, prompt-injection refuse)
     → SupervisorAgent (keyword + LLM JSON-schema routing)
        ├→ AnalystAgent     (read-only Q&A, RAG, V3 explain)
        ├→ PlannerAgent     (mutations via two-step confirmation)
        └→ ForecasterAgent  (cashflow + scenarios)
     → ToolRegistry (23 tools)
        ├→ Read (8): get_budgets/categories/goals/transactions/fx_rate/...
        ├→ Cognitive (6): calculate, lookup_education, explain_spending_change,
        │                 run_scenario, explain_recommendation, get_cashflow_summary
        ├→ Mutation (8): create_budget, add_budget_line, archive_budget,
        │                create_goal, contribute_to_goal, adjust_budget_line,
        │                accept_recommendation, snooze_recommendation
        └→ Memory (1): recall_memory
     → VerificationService (V2) — extracts numeric claims,
                                  transitive grounding,
                                  retry-loop on mismatch
     → response with ✓ N/N verification badge
```

Деталі — [docs/03-AI-ARCHITECTURE.md](docs/03-AI-ARCHITECTURE.md),
[docs/04-AI-TOOL-CATALOG.md](docs/04-AI-TOOL-CATALOG.md),
[docs/diagrams/03-c4-component-ai.md](docs/diagrams/03-c4-component-ai.md),
[docs/diagrams/06-sequence-diagrams.md](docs/diagrams/06-sequence-diagrams.md) (V2 + V3 sequences).

### Фронтенд

- **Next.js 16 App Router** з Server Components і Server Actions.
- **Tailwind 4** + кастомні primitives на `@base-ui/react`.
- **Recharts 3** для cashflow fan-chart і spending donut.
- **react-markdown + remark-gfm** для markdown-формату AI-відповідей.
- Чат-UI з sessions sidebar, "Нова розмова", verification badge,
  staged-action confirmation cards.

---

## Quick start

### Передумови

- Node 20+, npm 10+
- Postgres 16 з pgvector (або Supabase project)
- Redis 7 (для BullMQ)
- OpenAI API key (для LLM + embeddings)
- Monobank personal token (для імпорту транзакцій)

### 1. Backend

```powershell
cd backend
cp .env.example .env
# Заповни змінні (DATABASE_URL, OPENAI_API_KEY, SUPABASE_*,
#                 REDIS_URL, CREDENTIAL_ENCRYPTION_KEY, ...)

npm install
npm run prisma:migrate:deploy
npm run prisma:seed       # 80+ категорій з UA-локалізацією + 200 MCC
npm run kb:index          # 33 статті фінграмотності → pgvector

npm run dev               # http://localhost:4000
# Worker (окремий процес для outbox + sagas):
npm run worker:dev
```

### 2. Frontend

```powershell
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...

npm install
npm run dev               # http://localhost:3000
```

### 3. Перший вхід

1. Відкрий http://localhost:3000 → Sign up через Supabase.
2. На `/dashboard/accounts` встав Monobank-токен (отримати на
   <https://api.monobank.ua/>) → Імпортувати за 1 рік.
3. Перевір `/dashboard/spending` — donut по top-level категоріях.
4. Спробуй чат: "Чому я витратив більше цього місяця ніж минулого?"
   → побач `✓ Перевірено 5/5` бейдж.

---

## Емпірична валідація

Два окремих експерименти для розділу "Експериментальна перевірка"
магістерської:

### A. V2 verification layer (A/B test)

```powershell
# Прогон baseline (verifier ON)
$env:EVAL_TAG='with-verifier'; npm --prefix backend run eval:verifier

# Перезапусти бекенд із AI_VERIFICATION_ENABLED=false
$env:EVAL_TAG='no-verifier';   npm --prefix backend run eval:verifier

# Аналіз
pip install pandas matplotlib tabulate scipy
python eval/analyze.py
# → eval/analysis.md + 4 PNG графіки
```

Скрипт паєд analyze.py обчислює:
- mean / median hallucinationRate, % fully grounded;
- latency / cost overhead V2;
- paired t-test + Wilcoxon на статистичну значущість;
- розбивка за типом запиту (numeric / causal / educational / mutation / sanity).

### B. V3 decomposition (synthetic validation)

```powershell
npm --prefix backend run eval:decomp
```

6 сценаріїв з відомою ground-truth (price-only / volume-only / mix-in /
mix-out / cross-term / realistic-mix). Алгоритм відновлює всі ефекти з
помилкою 0 — це доказ, що декомпозиція точно адитивна:

```
Δspend ≡ priceEffect + volumeEffect + crossEffect + mixInEffect + mixOutEffect
```

Детальний гайд "як це презентувати на захисті" — [docs/thesis-evaluation-guide.md](docs/thesis-evaluation-guide.md).

---

## Документація

| Файл | Зміст |
|---|---|
| [docs/00-CONCEPT.md](docs/00-CONCEPT.md) | Мотивація, цільовий користувач |
| [docs/01-DOMAIN-DESIGN.md](docs/01-DOMAIN-DESIGN.md) | DDD, bounded contexts, domain events |
| [docs/02-BACKEND-MODULES.md](docs/02-BACKEND-MODULES.md) | Деталі модулів (включно з новими: fx, education, verification, credentials) |
| [docs/03-AI-ARCHITECTURE.md](docs/03-AI-ARCHITECTURE.md) | AI pipeline, multi-agent design |
| [docs/04-AI-TOOL-CATALOG.md](docs/04-AI-TOOL-CATALOG.md) | Каталог tools з контрактами і V2-інваріантом |
| [docs/05-DATABASE-SCHEMA.md](docs/05-DATABASE-SCHEMA.md) | Схема БД |
| [docs/06-BACKGROUND-JOBS.md](docs/06-BACKGROUND-JOBS.md) | BullMQ workers, outbox-pattern |
| [docs/07-FRONTEND-MODULES.md](docs/07-FRONTEND-MODULES.md) | Сторінки, компоненти |
| [docs/09-THESIS-STRUCTURE.md](docs/09-THESIS-STRUCTURE.md) | Структура магістерської роботи |
| [docs/thesis-evaluation-guide.md](docs/thesis-evaluation-guide.md) | Гайд для розділу "Експериментальна перевірка" |
| [docs/diagrams/](docs/diagrams/) | 33 Mermaid діаграми (C4 / sequence / state / ER) |

Рендер всіх діаграм у SVG+PNG:
```powershell
npm install -g @mermaid-js/mermaid-cli
npm --prefix backend run docs:render
# → docs/diagrams/rendered/*.svg + *.png
```

---

## Технологічний стек

| Шар | Технологія |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind 4, Recharts, react-markdown |
| Backend | NestJS 11, TypeScript 5 strict, Prisma 7 |
| Database | PostgreSQL 16 (Supabase) з pgvector |
| Cache / Queue | Redis 7, BullMQ |
| LLM | OpenAI (gpt-4o, gpt-4o-mini, text-embedding-3-small) |
| Auth | Supabase Auth (JWT, HS256 + ES256/RS256 dual-mode) |
| Validation | Zod (tools), class-validator (DTOs) |
| Charts (thesis) | Mermaid CLI, matplotlib, pandas |

---

## Що показує робота

1. **Multi-agent AI** з 23 tools, формальним каталогом, two-step
   confirmation для мутацій.
2. **Verification layer (V2)** — формалізація інваріанту "числа з БД,
   мова з LLM" з автоматичним retry-loop. Емпірично знижує hallucination
   rate vs baseline.
3. **Causal decomposition (V3)** — адаптація price/volume/mix
   decomposition до персональних фінансів через AI tool. Точно адитивна
   за побудовою.
4. **RAG над UA-фінграмотністю** — pgvector embeddings, 33 куровані
   статті, цитування з джерелом.
5. **Hierarchical category roll-up** — лінія бюджету на батьківську
   категорію автоматично агрегує дочірні, з most-specific-wins.
6. **Semantic category resolver** — agentic мапінг "квартира" → "Житло"
   через alias dict + substring + embedding cosine.
7. **Production-grade backbone** — DDD bounded contexts, outbox-pattern
   для гарантованої доставки подій, BullMQ-сагі, AES-256 encryption
   секретів, RLS для multi-tenant ізоляції.
8. **Емпіричне підтвердження** — golden-датасет 50 запитів × 2 конфігурації
   + 6 синтетичних сценаріїв для V3, з парними статистичними тестами.

Деталі — у [docs/09-THESIS-STRUCTURE.md](docs/09-THESIS-STRUCTURE.md) і
[docs/thesis-evaluation-guide.md](docs/thesis-evaluation-guide.md).
