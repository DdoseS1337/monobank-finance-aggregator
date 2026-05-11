# 00. Концепція та стратегічне позиціонування

## 1. Концептуальна відмінність термінів

Це питання обов'язково прозвучить на захисті. Чітке формулювання критично важливе.

| Рівень | Що робить | Природа | Приклад |
|---|---|---|---|
| **Фінансова аналітика** | Описує, що відбулося (descriptive) | Pull-модель, on-demand | "Ти витратив 12 400 ₴ на каву за рік" |
| **Фінансовий моніторинг** | Спостерігає в real-time, тригерить алерти | Push-модель, reactive | "Перевищено ліміт 'Розваги' на 15%" |
| **Управління персональними фінансами (PFM)** | Втручається у поведінку: бюджети, цілі, ліміти, allocation rules | Prescriptive, proactive | "Перенесено 2 000 ₴ з резерву в envelope 'Подорожі'" |
| **AI-assisted financial management** | Симулює сценарії, рекомендує дії, прогнозує дефіцити, навчається на користувачі | Cognitive, autonomous | "За 23 дні буде дефіцит -3 200 ₴; пропоную скоротити підписку Netflix або відтермінувати ціль 'Macbook' на 1 міс." |

**Ключова теза для роботи:**
- Аналітика → *"що сталося?"*
- Моніторинг → *"що відбувається зараз?"*
- Управління → *"що робити?"*
- AI-assisted management → *"що робити з урахуванням моєї поведінки, цілей, контексту і прогнозу?"*

## 2. Аудит поточного стану

**Сильні сторони:**
- Domain-relevant integration (Monobank API)
- AI-стек на рівні modern systems (RAG + LangGraph + tool-calling + vector search)
- DDD-натяки в backend
- Real-world data complexity (MCC, normalization, subscriptions)

**Критичні прогалини для теми "управління":**

| Прогалина | Чому це критично |
|---|---|
| Немає **Budgeting Engine** | Слово "управління" без бюджетів неможливе |
| Немає **Goals & Savings** домену | Це core PFM-фіча |
| Немає **Cash Flow Forecasting** | Прогнозування витрат ≠ прогнозування cash flow та дефіциту |
| Немає **Scenario Simulation** | What-if моделювання — це і є "AI-driven management" |
| Немає **Recommendation Engine** як окремого bounded context | Зараз AI лише відповідає, а не *рекомендує проактивно* |
| Немає **Rule Engine** (envelope rules, auto-allocation) | Без правил це не management |
| Немає **Notification Orchestration** | Proactive AI без сповіщень — мертвий |
| Немає **User Personalization Layer** з explicit preferences/risk profile | Без цього recommendations generic |
| Немає **AI Memory Architecture** на рівні long-term + episodic + semantic | Зараз threads — це лише short-term |
| Немає **Behavior Modeling** | Управління поведінкою = моделювання поведінки |
| Немає чіткого **Event-Driven backbone** | Без подій модулі будуть зв'язані синхронно — погано для роботи |

## 3. Стратегічне позиціонування

Замість додавати фічі точково, потрібно **позиціонувати проєкт як AI-augmented Personal Financial Operating System (PFOS)** з трьома шарами:

```
┌─────────────────────────────────────────────────────────┐
│ Cognitive Layer (AI agents, memory, reasoning, planning)│ ← новизна
├─────────────────────────────────────────────────────────┤
│ Management Layer (budgets, goals, rules, simulations)   │ ← закриває "управління"
├─────────────────────────────────────────────────────────┤
│ Analytical Layer (existing: insights, anomalies, RAG)   │ ← вже є
└─────────────────────────────────────────────────────────┘
```

### Чому це працює академічно

1. **Чітке наукове формулювання:** трирівнева когнітивно-управлінсько-аналітична модель — це формалізована новизна.
2. **Закриває тему повністю:** і "аналітика", і "управління" присутні явно.
3. **Production-ready:** кожен шар має свою відповідальність, можна реалізовувати інкрементально.
4. **Сильний наратив для захисту:** "ми починали з аналітики, додали management шар, потім AI-cognitive шар, що зробило систему проактивною".

## 4. Цільові характеристики системи

Система повинна відповідати таким принципам:

1. **Proactive over reactive** — система не чекає, коли користувач запитає, а сама пропонує дії.
2. **Explainable everywhere** — кожна рекомендація має формалізоване "чому".
3. **Human-in-the-loop** — критичні мутації (зміна бюджетів, переноси) мають confirmation step.
4. **Privacy by design** — сирі транзакції не йдуть у LLM, тільки агрегати.
5. **Event-driven** — модулі комунікують через події, не через прямі виклики.
6. **Personalized** — recommendations адаптуються до behavioral profile користувача.
7. **Multi-modal AI** — combine rules + ML + LLM, бо жоден з них окремо не оптимальний.
8. **Continuous learning** — recommendation feedback loop повертається в memory layer.

## 5. Що відрізняє від CRUD-проєктів

Магістерська рівня "modern AI system" вимагає:

- Не просто "є AI-чат", а **формальний tool catalog з контрактами**.
- Не просто "є рекомендації", а **hybrid pipeline з multi-criteria ranking**.
- Не просто "є прогноз", а **time-series + LLM + Monte Carlo з confidence intervals**.
- Не просто "є модулі", а **bounded contexts з aggregates і domain events**.
- Не просто "є БД", а **event-driven backbone через transactional outbox**.
- Не просто "є пам'ять", а **layered AI memory (working / episodic / semantic / procedural) з consolidation**.
- Не просто "є рули", а **AST-based rule engine з sandbox-evaluator**.
- Не просто "є сповіщення", а **notification orchestration з channel learning і throttling**.
