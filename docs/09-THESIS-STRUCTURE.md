# 09. Структура магістерської роботи

## 1. Скелет розділів

```
ВСТУП

РОЗДІЛ 1. АНАЛІТИЧНИЙ ОГЛЯД ПРЕДМЕТНОЇ ОБЛАСТІ
  1.1. Сучасний стан персонального фінансового менеджменту
  1.2. Огляд існуючих рішень (Mint, YNAB, Monobank, Revolut)
       — таблиця функціональних можливостей, gap-аналіз
  1.3. AI у персональних фінансах: тренди, обмеження, виклики
  1.4. Аналіз методів бюджетування (50/30/20, envelope, ZBB, PYF)
  1.5. Постановка проблеми та обґрунтування актуальності
  1.6. Об'єкт, предмет, мета, задачі дослідження
  Висновки до розділу 1

РОЗДІЛ 2. ТЕОРЕТИЧНІ ОСНОВИ ТА МЕТОДОЛОГІЯ
  2.1. Domain-Driven Design як методологія декомпозиції
  2.2. Event-Driven Architecture та CQRS
  2.3. Архітектурні патерни AI-augmented систем
  2.4. Multi-agent systems (огляд: ReAct, Plan-and-Execute,
       supervisor pattern, blackboard architecture)
  2.5. RAG-архітектура та hybrid retrieval (dense + sparse + RRF)
  2.6. Методи прогнозування фінансових потоків
       (ARIMA, Prophet, hybrid LLM-statistical)
  2.7. Recommendation systems: rule-based, ML, hybrid
  2.8. Multi-criteria decision making для ранжування рекомендацій
  2.9. Памʼять у AI-агентах: working / episodic / semantic / procedural
  Висновки до розділу 2

РОЗДІЛ 3. ПРОЄКТУВАННЯ СИСТЕМИ
  3.1. Концептуальна архітектура (трирівнева модель)
  3.2. Виділення bounded contexts (DDD)
  3.3. Aggregate roots та domain events
  3.4. Архітектура backend (модулі NestJS)
  3.5. Архітектура AI-cognitive layer
       3.5.1. Multi-agent supervisor pattern
       3.5.2. Tool catalog (формальні контракти)
       3.5.3. Memory architecture
       3.5.4. RAG pipeline
       3.5.5. Guardrails та human-in-the-loop
  3.6. Recommendation engine pipeline
  3.7. Rule engine: AST-evaluator
  3.8. Cashflow forecasting та scenario simulation
  3.9. Event-driven backbone (transactional outbox)
  3.10. База даних та схема даних
  3.11. Background jobs та оркестрація
  3.12. Архітектура frontend
  3.13. Безпека та privacy by design
  Висновки до розділу 3

РОЗДІЛ 4. ПРАКТИЧНА РЕАЛІЗАЦІЯ
  4.1. Технологічний стек та обґрунтування вибору
  4.2. Реалізація Budgeting Context
  4.3. Реалізація Goal Planning Context
  4.4. Реалізація Cashflow Forecasting
  4.5. Реалізація Recommendation Engine
  4.6. Реалізація Multi-Agent AI
  4.7. Реалізація AI Memory
  4.8. Реалізація Rule Engine
  4.9. Реалізація Notification Orchestration
  4.10. UI/UX реалізація
  4.11. Тестування (unit, integration, e2e, AI evals)
  4.12. Розгортання та DevOps
  Висновки до розділу 4

РОЗДІЛ 5. АНАЛІЗ РЕЗУЛЬТАТІВ ТА ОЦІНКА ЕФЕКТИВНОСТІ
  5.1. Метрики системи (technical KPI)
  5.2. Метрики AI (precision/recall recommendations, MAPE forecast,
       hallucination rate, tool call success rate)
  5.3. UX метрики (time-to-insight, recommendation acceptance rate)
  5.4. Порівняння з аналогами
  5.5. Сценарії використання (use cases)
  5.6. Обмеження та напрями подальших досліджень
  Висновки до розділу 5

РОЗДІЛ 6. ЕКОНОМІЧНА ЧАСТИНА (якщо потрібно у вузі)
РОЗДІЛ 7. ОХОРОНА ПРАЦІ (якщо потрібно)

ВИСНОВКИ
СПИСОК ВИКОРИСТАНИХ ДЖЕРЕЛ
ДОДАТКИ (схеми БД, фрагменти коду, скріншоти, prompts catalog)
```

## 2. Академічне формулювання

### Тема
Розробка інтелектуальної системи аналітики та управління персональними фінансами на основі мультиагентної AI-архітектури.

### Об'єкт дослідження
Процеси аналізу, прогнозування та управління персональними фінансовими ресурсами користувача.

### Предмет дослідження
Методи, моделі та архітектурні рішення побудови інтелектуальної системи персонального фінансового менеджменту з використанням мультиагентної AI-архітектури, RAG-методу пошуку інформації, гібридних рекомендаційних систем та event-driven доменно-орієнтованого підходу.

### Мета роботи
Підвищення ефективності управління персональними фінансами користувача шляхом розробки інтелектуальної системи, що поєднує описову, прогнозну та проактивно-приписову аналітику на основі мультиагентної AI-архітектури.

### Задачі роботи
1. Здійснити аналітичний огляд предметної області, методів персонального фінансового менеджменту та сучасних AI-підходів у цій галузі.
2. Сформулювати функціональні та нефункціональні вимоги до системи на основі gap-аналізу існуючих рішень.
3. Розробити концептуальну архітектуру системи на основі принципів DDD та event-driven design з виділенням bounded contexts.
4. Спроєктувати мультиагентну AI-архітектуру з shared-memory layer та формальним каталогом інструментів.
5. Розробити гібридний рекомендаційний рушій, що поєднує rule-based, ML та LLM-генератори з multi-criteria ранжуванням.
6. Спроєктувати модуль прогнозування грошових потоків та сценарного моделювання.
7. Розробити модулі бюджетування, цільового планування та правил автоматизації.
8. Реалізувати спроєктовану систему з використанням NestJS, Next.js, PostgreSQL, Redis, LangChain/LangGraph.
9. Провести експериментальну оцінку ефективності системи за технічними та AI-метриками.

### Наукова новизна

Формулюйте обережно — для magister рівня доречні три типи внеску:

1. **Удосконалено** архітектурний підхід до проєктування інтелектуальних систем персонального фінансового менеджменту шляхом інтеграції event-driven domain-driven архітектури з мультиагентною AI-системою та шаруватою моделлю пам'яті, що відрізняється від існуючих підходів декомпозицією на cognitive/management/analytical шари.

2. **Удосконалено** метод формування фінансових рекомендацій шляхом поєднання rule-based, ML та LLM-генераторів з подальшим multi-criteria ранжуванням, що дозволяє підвищити релевантність рекомендацій порівняно з суто LLM-підходом.

3. **Дістав подальшого розвитку** метод прогнозування грошових потоків шляхом інтеграції статистичних моделей часових рядів з LLM-based qualitative adjuster та Monte Carlo симуляцією, що враховує контекст активних бюджетів і цілей.

4. **Запропоновано** формальну модель шаруватої пам'яті AI-агента (working / episodic / semantic / procedural) для систем персонального фінансового менеджменту з механізмами consolidation та decay.

### Практична цінність

1. Розроблено повнофункціональну production-ready систему з реальною інтеграцією Monobank API.
2. Проактивні рекомендації дозволяють користувачу запобігати фінансовим дефіцитам до їх виникнення.
3. Архітектурні рішення можуть бути перенесені на інші банківські API через адаптерний патерн.
4. Запропонований tool catalog може використовуватись як reference у подібних AI-augmented фінансових системах.

## 3. UML / BPMN / Sequence — необхідний мінімум

### Обов'язкові діаграми

1. **Use Case Diagram** — actors (User, AI Agent, External Bank, Notification Channel)
2. **Component Diagram** (UML 2.x) — high-level модулі
3. **Class Diagrams** для core контекстів (Budgeting, Goals, Cashflow)
4. **Sequence Diagrams**:
   - Transaction import → categorization → budget update → recommendation
   - User asks AI → orchestrator → sub-agent → tool → response
   - Recommendation generation pipeline
   - Goal contribution flow з rule engine
5. **Activity Diagrams** для бізнес-процесів (BPMN-style):
   - Budget period lifecycle
   - Recommendation lifecycle (generated → delivered → accepted/rejected → fed back)
   - Cashflow forecast pipeline
6. **State Diagrams**:
   - Budget states
   - Goal states
   - Recommendation states
   - Agent session FSM
7. **ER-діаграма** бази даних (повна або по контекстах)
8. **Deployment Diagram** — Vercel + Supabase + Redis + workers
9. **Architecture diagram** (C4 model — Context, Container, Component) — це сильно піднімає рівень роботи

## 4. Як описати AI-agent architecture академічно

Уникати маркетингового тону. Замість *"AI assistant допомагає"* — формальне:

> *"Cognitive layer реалізовано як мультиагентну систему, що базується на supervisor pattern та використовує LangGraph як state-machine оркестратор. Система складається з координаторного агента та n спеціалізованих субагентів, кожен з яких має визначений набір інструментів формального контракту T = (name, inputSchema, outputSchema, sideEffects, authorization). Взаємодія між агентами реалізована через shared blackboard, що зберігається в memory layer та реалізує модель пам'яті, наближену до архітектури Atkinson-Shiffrin..."*

### Цитувати

- Yao et al. — ReAct (2022)
- Wei et al. — Chain-of-Thought
- Lewis et al. — RAG (2020)
- Shinn et al. — Reflexion
- Park et al. — Generative Agents (для memory architecture)
- Eric Evans — Domain-Driven Design
- Greg Young — CQRS / Event Sourcing
- Vaughn Vernon — Implementing DDD
- Atkinson, R., & Shiffrin, R. — Multi-store memory model (для AI memory)
- Karpathy A. — про tool-use в LLMs
- Anthropic — Constitutional AI (для guardrails)

## 5. Як описати Recommendation Engine академічно

Описувати як **hybrid recommender** з формалізацією:

```
Множина candidates:    C = C_rules ∪ C_ml ∪ C_llm

Ранжування:           score(c) = w₁·utility(c) + w₂·urgency(c) 
                              + w₃·novelty(c) + w₄·user_fit(c)

Метрики оцінки:       precision@k, recall@k, NDCG, 
                      acceptance rate, diversity (Jaccard)
```

## 6. Як описати Knowledge Base та RAG

Описати:
- Структуру корпусу (financial education, MCC reference, regulations)
- Chunking strategy (semantic chunking з overlap)
- Embedding model + dimensions
- Index type (HNSW з параметрами m, ef_construction)
- Hybrid retrieval з RRF-формулою
- Re-ranking (cross-encoder, LLM-as-judge)
- Eval методику (RAGAS metrics: faithfulness, answer relevancy, context precision)

## 7. Структура та обсяги розділів (орієнтовно)

| Розділ | Сторінок | Зміст |
|---|---|---|
| Вступ | 3-5 | Актуальність, мета, задачі, новизна |
| 1. Огляд | 15-20 | Літературний огляд, gap analysis |
| 2. Теоретичні основи | 20-25 | Методи, моделі, патерни |
| 3. Проєктування | 30-40 | **Найбільший**: архітектура, моделі, схеми |
| 4. Реалізація | 25-30 | Код, технічні рішення |
| 5. Результати | 10-15 | Метрики, оцінка, порівняння |
| 6. Економічна / 7. Охорона праці | 5-10 | Якщо вимагається кафедрою |
| Висновки | 2-3 | Що зроблено, що далі |
| Список джерел | 3-5 | 50-80 джерел |
| Додатки | 10-30 | Код, схеми, скріншоти |
| **Загалом** | **~120-150** | |

## 8. Особливості академічного стилю

### Чого уникати
- ❌ "Я зробив", "Ми вирішили" — пасивний стан або безособові форми
- ❌ Маркетингова мова: "neat", "awesome", "magic"
- ❌ Англізми без перекладу: "user-friendly" → "зручний для користувача"
- ❌ Скриншоти UI замість архітектурного опису
- ❌ Listing коду без пояснення
- ❌ Власні думки без обґрунтування ("я вважаю, що...")

### Що використовувати
- ✅ "Розроблено", "Запропоновано", "Реалізовано"
- ✅ "Як показано на рис. 3.4..."
- ✅ "Згідно з [Lewis et al., 2020]..."
- ✅ Формули, schemas, contracts
- ✅ Tabular comparisons
- ✅ Структуроване порівняння з аналогами

## 9. Як описати конкретні модулі

### Budgeting Engine

> *"Розроблено модуль бюджетування Budgeting Context, що реалізує чотири методи: category-based, envelope-based, zero-based та pay-yourself-first. Модуль є aggregate root відповідно до DDD-методології (Evans, 2003), що інкапсулює інваріанти бюджету та емітує доменні події `BudgetLineExceeded`, `EnvelopeRebalanced`, `BudgetPeriodClosed`. Health-метрика бюджету визначається як композитний показник на основі burn rate (відношення відсотка витрачених коштів до відсотка часу, що минув) та проєкції overrun..."*

### Recommendation Engine

> *"Запропоновано гібридний рекомендаційний рушій, що поєднує rule-based, machine-learning та LLM-based генератори. Кожен генератор продукує множину кандидатів `C_i ⊂ C`, які об'єднуються в `C = ⋃ C_i` та ранжуються за multi-criteria decision matrix з критеріями utility, urgency, novelty та user_fit. Ваги критеріїв адаптуються до профілю користувача (UserProfile), зокрема risk_tolerance впливає на ваги novelty vs urgency..."*

### Multi-agent system

> *"Реалізовано мультиагентну систему за supervisor pattern (Wu et al., 2023), де координаторний агент здійснює intent classification та маршрутизацію до спеціалізованих субагентів. Стан кооперації агентів моделюється як скінченний автомат з використанням LangGraph framework. Кожен агент має формально визначений набір tools T_a ⊂ T, де T — глобальний tool catalog..."*

## 10. Висновки до розділів — шаблон

```
Висновки до розділу 3
1. Запропоновано трирівневу концептуальну архітектуру системи
   (cognitive / management / analytical layers).
2. Виділено [N] bounded contexts відповідно до методології DDD,
   серед яких [N_core] core та [N_support] supporting.
3. Розроблено мультиагентну AI-архітектуру за supervisor pattern,
   що включає [N] спеціалізованих агентів та шарувату модель пам'яті.
4. Спроєктовано гібридний рекомендаційний pipeline з multi-criteria
   ранжуванням.
5. Розроблено схему БД, що містить [N] таблиць у [M] контекстах.
```

## 11. Що показати у додатках

- Додаток А: Повна ER-діаграма
- Додаток Б: Sequence-діаграми (всі)
- Додаток В: Tool catalog (повний)
- Додаток Г: Domain events catalog
- Додаток Д: Скріншоти UI з анотаціями
- Додаток Е: Фрагменти коду (key abstractions, не CRUD)
- Додаток Є: Prompts catalog (system prompts, agent prompts)
- Додаток Ж: API endpoints (OpenAPI exported)
- Додаток З: Test results (AI evals output)

## 12. Захист — типові питання та відповіді

| Питання | Відповідь |
|---|---|
| Чим відрізняється від Mint/YNAB? | Multi-agent AI з proactive management, conversational mutations, hybrid recommendations |
| Чому DDD? | Cross-context complexity, незалежна еволюція, чіткі межі |
| Чому multi-agent? | Tool focus, scalable cognitive load, debugging, спеціалізація |
| Як ви валідуєте AI-recs? | Human-in-the-loop, two-step confirmations, explainability |
| Як ви боретеся з hallucinations? | Guardrails, claim verification, structured outputs з schema |
| Як це працює в проді? | Deployment diagram, scaling, observability metrics |
| Як ви оцінили якість? | RAGAS metrics, acceptance rate, MAPE для прогнозу |
| Що нового? | Гібридний recommendation engine + AI memory layer + DDD-AI integration |
| Чому Prophet, а не LSTM? | Інтерпретованість, малі дані, robust на seasonality |
| Як ви захищаєте дані? | RLS in Supabase, no raw data to LLM, audit log, encryption at rest |
