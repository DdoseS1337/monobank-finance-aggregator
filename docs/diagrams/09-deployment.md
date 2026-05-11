# Deployment

Target deployment topology — what runs where in production.

```mermaid
%%{init: {'theme':'neutral'}}%%
flowchart TB
    user(("👤 Користувач"))

    subgraph cdn [Vercel Edge / CDN]
        edge["Static assets<br/>(_next/static, images)"]
        proxy["proxy.ts<br/>(auth gate at edge)"]
    end

    subgraph nextjs [Next.js runtime — Vercel]
        ssr["Server Components +<br/>Server Actions<br/>(Node.js)"]
    end

    subgraph backend [PFOS backend — Fly.io / Railway / Render]
        api["nestjs-api<br/>1+ replicas<br/>HTTP API + Swagger"]:::api
        worker["nestjs-workers<br/>1 replica<br/>BullMQ processors + cron"]:::worker
    end

    subgraph data [Managed services]
        supabase[("Supabase<br/>Auth + Postgres + pgvector")]
        redis[("Redis<br/>(Upstash / managed)")]
    end

    subgraph llm [External APIs]
        openai[("OpenAI")]
        mono[("Monobank")]
    end

    user --> edge
    edge --> proxy
    proxy -->|authenticated| ssr
    proxy -->|unauth → /login| ssr

    ssr -- "REST + Bearer JWT" --> api
    ssr -- "Cookies, OAuth" --> supabase

    api --> supabase
    api --> redis
    api -. "outbox →" .-> redis
    worker --> supabase
    worker --> redis
    worker --> openai
    worker --> mono
    api --> mono

    classDef api fill:#3b82f6,stroke:#1d4ed8,color:#fff
    classDef worker fill:#8b5cf6,stroke:#6d28d9,color:#fff
```

## Sizing recommendations (MVP)

| Component | Tier | Notes |
|---|---|---|
| Vercel | Hobby або Pro | Next.js 16, 1 region (близький до Supabase) |
| nestjs-api | 1× shared CPU, 512 MB RAM | scale-out на 2+ replicas після ~100 RPS |
| nestjs-workers | 1× shared CPU, 1 GB RAM (LLM-heavy) | НЕ scale-out поки cron-job контракт не змінено на distributed-locks |
| Supabase | Free tier для разробки, Pro для продакшну | RLS не використовується (service-role); `pg_cron` опційний |
| Redis (Upstash) | 256 MB | BullMQ + dedup keys |

## Scaling notes

1. **API process** — stateless; horizontal scaling за RPS.
2. **Workers process** — поточний код припускає **single replica** через @Cron-jobs. Якщо потрібна decentralization:
   - Винести cron jobs у окремий `scheduler` процес.
   - Worker pool скейлити по черзі (BullMQ підтримує).
   - Distributed lock (Redis) на критичні cron.
3. **OutboxPublisher** — 1 секунда polling; для high throughput замінити на `LISTEN/NOTIFY` (Postgres) + back-up polling.
4. **Postgres** — найбільш важка частина: pgvector індекси HNSW требують RAM пропорційно `m × dim × N`.
5. **OpenAI** — лімітів trigger-аware: `ai` ThrottlerGuard (10/min) на /ai/chat; cron @ 03:00 UTC consolidates пакетно.

## Observability (recommended for Phase 8)

- Logs: Pino (вже у deps) + nestjs-pino → JSON; ship to Logtail / Better Stack
- Metrics: Prometheus exporter на /metrics (BullMQ ships own); dashboards у Grafana
- Tracing: OpenTelemetry SDK + Jaeger / Honeycomb
- Cost telemetry: вбудовано — `agent_sessions.totalCostUsd` / `agent_turns.costUsd`

## Disaster recovery

- Postgres: щоденні snapshots Supabase (incl. PITR на Pro)
- Redis: BullMQ jobs не критичні (виконаються при наступному cron); dead-letter queue зберігає failed
- OutboxPublisher: at-least-once гарантія + ідемпотентні споживачі через `event_id` як dedup key
