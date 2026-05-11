# C4 — Containers

Container view: процеси / сервіси та як вони комунікують.

```mermaid
%%{init: {'theme':'neutral'}}%%
flowchart TB
    user(("👤 Користувач"))

    subgraph browser [Browser]
        web["Next.js 16 App<br/>(React 19, Tailwind 4)<br/>Server Components + Server Actions"]:::web
    end

    subgraph cluster [PFOS cluster]
        api["API process<br/>(NestJS HTTP)<br/>- AllExceptionsFilter<br/>- ThrottlerGuard<br/>- SupabaseAuthGuard"]:::api
        worker["Workers process<br/>(NestJS context)<br/>- BullMQ Processors<br/>- @Cron jobs<br/>- Outbox publisher"]:::worker
        redis[("Redis<br/>(BullMQ queues)")]
        pg[("Postgres<br/>+ pgvector + pg_trgm")]:::db
    end

    subgraph external [External]
        supabase[("Supabase Auth")]
        mono[("Monobank")]
        openai[("OpenAI")]
    end

    user --> web
    web -- "HTTPS<br/>Bearer JWT" --> api
    web -- "OAuth/Magic link" --> supabase

    api -- "SQL + outbox INSERT<br/>(transactional)" --> pg
    api -- "Verify JWT<br/>(local HS256 / API)" --> supabase
    api -- "Read account.metadata.token<br/>+ link new accounts" --> mono
    mono -- "POST /webhooks/monobank<br/>(unauth, sig optional)" --> api

    worker -- "LISTEN/poll outbox" --> pg
    worker -- "Enqueue/consume" --> redis
    worker -- "Embeddings, chat,<br/>function calling" --> openai
    worker -- "Pull statements" --> mono

    api -. "outbox row →<br/>publisher → BullMQ" .-> redis

    classDef web fill:#10b981,stroke:#047857,color:#fff
    classDef api fill:#3b82f6,stroke:#1d4ed8,color:#fff
    classDef worker fill:#8b5cf6,stroke:#6d28d9,color:#fff
    classDef db fill:#f59e0b,stroke:#b45309,color:#fff
```

## Process responsibilities

### API process (`backend/src/main.ts`)
- HTTP REST + Swagger
- Supabase JWT verification (hybrid: local HS256 → fallback `auth.getUser`)
- Domain mutations + outbox writes (single transaction)
- ThrottlerGuard глобально (`default` 120/min, `ai` 10/min)
- AllExceptionsFilter — uniform error JSON

### Workers process (`backend/src/workers/main.ts`)
- BullMQ Processors на 14 queues (categorization, budgets, rules, recommendations, notifications, ai-memory, …)
- @Cron jobs (cashflow refresh, memory consolidation, recommendation pipeline, traits refresh, notification delivery)
- OutboxPublisher: 1s polling → BullMQ enqueue → mark processed
- Single replica (deduplication burden ON; can scale per-queue if needed)

### Redis
- BullMQ backplane (jobs, schedules, dead-letter queue)
- Не використовується як cache — стан тримається у Postgres

### Postgres
- Усі агрегати (transactions, budgets, goals, cashflow, recommendations, …)
- pgvector для memory + recommendation embeddings (HNSW index)
- pg_trgm для fuzzy text search
- Domain events table + outbox table (transactional)
- RLS policies заборонено для сервіс-роль; user_id-фільтрація в application layer
