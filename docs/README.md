# Документація магістерського проєкту

**Тема:** Розробка інтелектуальної системи аналітики та управління персональними фінансами на основі мультиагентної AI-архітектури.

## Структура документації

| Файл | Призначення |
|---|---|
| [00-CONCEPT.md](./00-CONCEPT.md) | Стратегічний аналіз, концептуальні відмінності термінів, позиціонування проєкту |
| [01-DOMAIN-DESIGN.md](./01-DOMAIN-DESIGN.md) | DDD: bounded contexts, aggregate roots, domain events |
| [02-BACKEND-MODULES.md](./02-BACKEND-MODULES.md) | Структура NestJS-модулів (budgeting, goals, cashflow, recommendations, rules) |
| [03-AI-ARCHITECTURE.md](./03-AI-ARCHITECTURE.md) | Multi-agent system, AI memory, RAG pipeline, tool orchestration, guardrails |
| [04-AI-TOOL-CATALOG.md](./04-AI-TOOL-CATALOG.md) | Повний каталог AI-tools з контрактами |
| [05-DATABASE-SCHEMA.md](./05-DATABASE-SCHEMA.md) | SQL-схема нових таблиць (нова частина системи) |
| [06-BACKGROUND-JOBS.md](./06-BACKGROUND-JOBS.md) | BullMQ-черги, cron-розклад, processors |
| [07-FRONTEND-MODULES.md](./07-FRONTEND-MODULES.md) | UI/UX-структура, ключові патерни, інформаційна архітектура |
| [08-MUST-HAVE-VS-OPTIONAL.md](./08-MUST-HAVE-VS-OPTIONAL.md) | Розподіл функцій за пріоритетом для магістерської |
| [09-THESIS-STRUCTURE.md](./09-THESIS-STRUCTURE.md) | Структура магістерської роботи, академічне формулювання |
| [10-ROADMAP.md](./10-ROADMAP.md) | Поетапна реалізація, фази, тривалість |

## Як користуватись

1. Перед стартом реалізації — прочитати `00-CONCEPT.md` для розуміння позиціонування.
2. Перед кожною фазою — звіряти з `10-ROADMAP.md`.
3. При написанні розділу 3 (Проєктування) — використовувати `01-DOMAIN-DESIGN.md`, `02-BACKEND-MODULES.md`, `03-AI-ARCHITECTURE.md`.
4. При написанні розділу 4 (Реалізація) — використовувати `04-AI-TOOL-CATALOG.md`, `05-DATABASE-SCHEMA.md`, `06-BACKGROUND-JOBS.md`.
5. При оформленні академічної частини — `09-THESIS-STRUCTURE.md`.

## Поточний стан системи

**Реалізовано:**
- Імпорт транзакцій через Monobank API
- Категоризація через MCC-коди
- AI-чат над фінансовими даними (RAG + tool-calling)
- Аналітика витрат, виявлення підписок, прогнозування
- Інсайти та аномалії
- Vector search, AI-agent architecture (LangChain/LangGraph)

**Потребує реалізації** (ядро магістерської):
- Budgeting Engine
- Goal Planning Engine
- Cashflow Forecasting & Scenario Simulation
- Recommendation Engine (hybrid: rules + ML + LLM)
- Rule Engine (automation)
- Multi-Agent AI з shared memory
- Notification Orchestration
- Personalization Layer
- Event-driven backbone (transactional outbox + BullMQ)

## Технологічний стек

- **Frontend:** Next.js, TypeScript
- **Backend:** NestJS, TypeScript
- **БД:** PostgreSQL (Supabase) + pgvector
- **Cache/Queues:** Redis + BullMQ
- **AI:** OpenAI API, LangChain, LangGraph, embeddings
- **Інтеграції:** Monobank API
- **Архітектура:** DDD, Event-Driven, CQRS-натяки, Multi-Agent
