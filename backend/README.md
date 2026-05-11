# PFOS Backend

Personal Financial Operating System — NestJS backend.

Architecture: see `../docs/`. Roadmap: `../docs/10-ROADMAP.md`.

## Phase 1 status (Foundation) — DONE

- [x] Scaffold (TS, NestJS, Prisma, BullMQ, Supabase)
- [x] Prisma schema for all bounded contexts
- [x] Shared kernel: `Money`, `Period`, `DomainEvent`, event routing
- [x] Event-driven backbone: `DomainEventBus` + `OutboxPublisher`
- [x] Queue setup (BullMQ + Redis)
- [x] Supabase auth guard
- [x] HTTP bootstrap + Swagger
- [x] Workers entrypoint
- [x] Module skeletons

## Quick start

```bash
cp .env.example .env
# Fill DATABASE_URL, SUPABASE_*, OPENAI_API_KEY, REDIS_*

npm install
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
npm run prisma:seed

# Two processes:
npm run start:dev     # HTTP API on :4000
npm run worker:dev    # BullMQ workers
```

Swagger: http://localhost:4000/docs

## Required Postgres extensions

The Prisma schema declares: `pgcrypto`, `vector` (pgvector), `pg_trgm`.
On Supabase enable from Dashboard → Database → Extensions.

## Next phases

- **Phase 2** — Budgeting + Goals + Rules engines
- **Phase 3** — Cashflow forecasting + scenarios
- **Phase 4** — Multi-agent AI + memory + recommendations
- **Phase 5** — Notification orchestration + personalization
- **Phase 6** — Frontend
- **Phase 7** — Eval + documentation

See `../docs/10-ROADMAP.md` for detailed task breakdowns.
