# ФінДашборд — інтелектуальна агрегація персональних фінансів

Веб-застосунок для автоматизованого збору, нормалізації, аналізу та прогнозування
персональних фінансових операцій на базі Monobank API з AI-асистентом,
виявленням патернів та інсайтів.

> Магістерська робота. Основний фокус — демонстрація прикладних алгоритмів
> аналізу часових рядів, статистичного виявлення аномалій, ML-прогнозування,
> а також інтеграції LLM як структурованого агента (function calling / tool-use).

---

## Зміст

1. [Архітектура системи](#архітектура-системи)
2. [Модель даних](#модель-даних)
3. [Модулі бекенду](#модулі-бекенду)
   - [3.1. Інгестія транзакцій](#31-інгестія-транзакцій)
   - [3.2. Збагачення категоріями (enrichment)](#32-збагачення-категоріями-enrichment)
   - [3.3. Аналітика](#33-аналітика)
   - [3.4. Виявлення патернів](#34-виявлення-патернів)
   - [3.5. Інсайти](#35-інсайти)
   - [3.6. Прогнозування](#36-прогнозування)
   - [3.7. AI-асистент (tool-use)](#37-ai-асистент-tool-use)
4. [Фронтенд](#фронтенд)
5. [Кешування та інвалідація](#кешування-та-інвалідація)
6. [Безпека](#безпека)
7. [Технологічний стек](#технологічний-стек)
8. [Запуск локально](#запуск-локально)

---

## Архітектура системи

Моно-репозиторій з двох незалежних застосунків:

```
diploma2/
├── backend/      NestJS 11 API + Prisma + PostgreSQL + Redis
└── frontend/     Next.js 16 (App Router) + React 19 + Tailwind 4 + Recharts
```

### Високорівнева схема

```
┌─────────────────┐        ┌──────────────────┐        ┌────────────────┐
│   Monobank API  │◀──rate-│                  │        │   Supabase     │
│  (personal/     │  limited│   NestJS API    │────────│   Postgres +   │
│   statement)    │         │  (prisma+pg)    │        │   Auth (JWT)   │
└─────────────────┘         │                  │        └────────────────┘
                            │                  │        ┌────────────────┐
                            │                  │────────│    Redis       │
                            │                  │        │    (cache)     │
                            └────────┬─────────┘        └────────────────┘
                                     │
                           HTTPS + JWT auth
                                     │
                            ┌────────▼─────────┐        ┌────────────────┐
                            │  Next.js Client  │────────│ OpenAI /       │
                            │  (App Router +   │  (via  │ Anthropic      │
                            │   React 19 SSR)  │ backend│ (LLM APIs)     │
                            └──────────────────┘  only) └────────────────┘
```

Усі звернення до LLM-провайдерів проходять через бекенд — ключі API ніколи
не потрапляють до браузера. Фронтенд отримує стрім SSE.

### Доменно-орієнтована структура модуля

Кожен функціональний модуль бекенду розкладено за шаром Domain–Application–Infrastructure–Presentation:

```
modules/<назва>/
├── domain/              доменні типи, інтерфейси
├── infrastructure/      репозиторії, зовнішні клієнти, raw SQL
├── application/         сервіси з бізнес-логікою, кешуванням
└── presentation/        REST-контролери, DTO з class-validator
```

Ця схема дозволяє чітко відокремити:
- доменні типи (не залежать від БД чи HTTP),
- чисту бізнес-логіку (можна юніт-тестувати без mock-ів),
- доступ до даних (єдине місце, де використовується Prisma),
- HTTP-шар (валідація, guard-и, серіалізація).

---

## Модель даних

### Ключові таблиці (PostgreSQL через Prisma)

| Таблиця | Призначення |
|---|---|
| `users` (Supabase) | Аутентифікація через email/password, видає JWT |
| `accounts` | Зв'язані банківські рахунки користувача (multi-provider) |
| `transactions` | Нормалізовані транзакції (uniq за `source + external_id`) |
| `mcc_reference` | Довідник MCC-кодів з нормалізованою категорією |
| `merchant_rules` | Правила категоризації за текстом опису (regex/contains/exact) |
| `ai_threads` | Чат-сесії з AI-асистентом |
| `ai_messages` | Історія повідомлень чату (role + parts як JSONB) |

### Схема `transactions` (ключове для обчислень)

```prisma
model Transaction {
  id                String          @id @default(uuid())
  userId            String
  accountId         String?
  source            String                             // "monobank" | "manual" | "csv"
  externalId        String                             // id від банку
  amount            Decimal         @db.Decimal(18, 2) // зі знаком: DEBIT < 0, CREDIT > 0
  operationAmount   Decimal         @db.Decimal(18, 2) // сума в оригінальній валюті
  currency          String                             // ISO-4217 код
  cashbackAmount    Decimal
  commissionRate    Decimal
  balance           Decimal                            // баланс після операції
  descriptionRaw    String                             // оригінальний опис
  merchantNameClean String?                            // нормалізований мерчант
  mcc               Int?
  mccCategory       String?                            // напр. "Food", "Transport"
  transactionType   TransactionType                    // DEBIT | CREDIT | TRANSFER | HOLD
  transactionTime   DateTime
  rawData           Json                               // повна відповідь банку

  @@unique([source, externalId])
  @@index([userId])
  @@index([accountId])
  @@index([transactionTime])
  @@index([mcc])
}
```

**Ключове рішення:** `amount` зберігається **зі знаком** — це природньо для
фінансових операцій і дозволяє робити `SUM(amount)` для чистого потоку.
Всі запити, що показують "витрати", використовують `ABS(amount)` або
`SUM(amount) FILTER (WHERE transaction_type = 'DEBIT')`.

---

## Модулі бекенду

### 3.1. Інгестія транзакцій

**Модуль:** `modules/transactions`

**Потік даних при синхронізації:**

```
1. Користувач → POST /transactions/sync { source, token, accountId, from, to }
2. BankProvider (Monobank) → fetch statements
   - Rate limit: 1 запит / 60 сек (фіксує Monobank API)
   - Large ranges → chunked (max 31 день / чанк)
3. Mapper: raw Monobank → NormalizedTransaction
   - kopiykas ÷ 100
   - currencyCode (980) → ISO string ("UAH")
   - тип за знаком amount (DEBIT < 0, CREDIT > 0)
4. Enrichment (3.2): додаємо mccCategory
5. Upsert у Postgres (batched ×25 паралельно)
6. Інвалідація Redis кеша для цього userId
```

**Технічні деталі:**

- **Ідемпотентність:** unique constraint на `(source, external_id)` —
  повторна синхронізація не створює дублів. `upsertMany` на update-гілці
  перезаписує `transactionType`, `merchantNameClean`, `mccCategory`, `balance` —
  тобто старі дані автоматично виправляються, якщо змінилась логіка нормалізації.

- **Батчинг:** замість одного великого interactive transaction
  (`prisma.$transaction`), який на 300+ рядках виходить за 5-секундний
  timeout Prisma, робимо чанки по 25 upsert-ів паралельно через
  `Promise.all`. Ідемпотентність зберігається через унікальний constraint.

- **Інвалідація кеша:** після `upsertMany` викликається
  `redis.delPattern('analytics:*:{userId}:*')` через Redis `SCAN` (non-blocking).
  Те саме для префіксів `patterns`, `insights`, `forecast`.

### 3.2. Збагачення категоріями (enrichment)

Двоступенева категоризація транзакції:

```
            ┌─ mccLookup(tx.mcc) ──── MCC Reference (cached 24h in Redis)
tx.mcc?  ───┤
            └─ fallback → MerchantRuleService
                          (CONTAINS / EXACT / REGEX на merchant + description,
                           priority-ordered)
```

**Чому такий порядок:** MCC-код від банку — найнадійніший сигнал.
Якщо банк проставив MCC 5812 (Eating Places), ми впевнені що це "Food".
Якщо MCC відсутній (наприклад, переказ), звертаємось до правил за текстом.

**Структура `merchant_rules`:**
- `matchType: CONTAINS | EXACT | REGEX`
- `field: MERCHANT | DESCRIPTION | BOTH`
- `priority: int` (менше число = вище пріоритет)
- `isActive: bool`

Правила завантажуються в пам'ять при старті модуля та відсортовані за
пріоритетом — за рахунок цього один transaction.enrichCategories() коштує
O(N-rules) на перший match, що лінійно відносно ~100 правил = <1ms.

### 3.3. Аналітика

**Модуль:** `modules/analytics`

11 REST-ендпоінтів, кожен кешується в Redis з різним TTL залежно від вартості
обчислення:

| Endpoint | Метод | TTL | Формули / алгоритми |
|---|---|---|---|
| `GET /analytics/summary` | KPI | 300c | Поточний vs попередній місяць, середні денні витрати |
| `GET /analytics/spending-by-category` | groupBy | 600c | `SUM(ABS(amount))` per category, percentage |
| `GET /analytics/top-categories` | groupBy | 600c | Те саме, + `_avg`, `_count`, rank |
| `GET /analytics/top-merchants` | groupBy | 600c | По `merchantNameClean` |
| `GET /analytics/spending-trend` | raw SQL | 900c | **7-денне ковзне середнє** (window function) |
| `GET /analytics/average-transaction` | groupBy | 900c | `_avg`, `_min`, `_max` per category |
| `GET /analytics/income-summary` | aggregate | 900c | `SUM(amount)` WHERE type=CREDIT + топ джерела + місячна розбивка |
| `GET /analytics/monthly-trend` | raw SQL | 1800c | `DATE_TRUNC('month')` + income/expense FILTER |
| `GET /analytics/income-vs-expense` | raw SQL | 1800c | Granularity: day/week/month |
| `GET /analytics/period-comparison` | raw SQL | 1800c | Dual-period SUM за одним пасом через `FILTER` |
| `GET /analytics/day-of-week` | raw SQL | 3600c | `EXTRACT(DOW FROM transaction_time)` |

**Ключові SQL-техніки:**

1. **Window function для ковзного середнього** (spending-trend):
   ```sql
   AVG(amount) OVER (
     ORDER BY date
     ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
   ) AS moving_avg
   ```
   Це згладжує щоденні піки і показує тренд без шумів.

2. **Two-period aggregation за одним SELECT** (period-comparison):
   ```sql
   SUM(ABS(amount)) FILTER (WHERE transaction_time BETWEEN p1_from AND p1_to) AS p1,
   SUM(ABS(amount)) FILTER (WHERE transaction_time BETWEEN p2_from AND p2_to) AS p2
   ```
   Один прохід по даних замість двох окремих запитів.

3. **Explicit `::timestamp` касти всередині поліморфних функцій**
   (LEAST/GREATEST) — PostgreSQL інакше дефолтить параметри до `text`
   і падає з `operator does not exist: timestamp >= text`.

### 3.4. Виявлення патернів

**Модуль:** `modules/patterns`

#### Регулярні платежі та підписки

Виявляємо шляхом аналізу **статистики інтервалів** між послідовними
транзакціями одного мерчанта.

**Алгоритм (SQL + TypeScript):**

```sql
WITH with_intervals AS (
  SELECT merchant, amount, ts,
         EXTRACT(EPOCH FROM ts - LAG(ts) OVER (PARTITION BY merchant ORDER BY ts))
           / 86400.0 AS interval_days
  FROM transactions
  WHERE transaction_type = 'DEBIT'
)
SELECT merchant,
       AVG(amount) AS avg_amount,
       AVG(interval_days) AS avg_interval,
       STDDEV(interval_days) AS std_interval,
       STDDEV(amount) / AVG(amount) AS amount_cv,
       COUNT(*) AS tx_count
FROM with_intervals
GROUP BY merchant
HAVING COUNT(*) >= 3
```

**Класифікація (`patterns.service.ts`):**

| Показник | Формула | Regular Payment | Subscription |
|---|---|---|---|
| **Confidence** | `1 − std_interval / avg_interval` | ≥ 0.5 | ≥ 0.65 |
| **Amount CV** (coefficient of variation) | `std_amount / avg_amount` | — | < 0.15 |
| **Interval range** | — | 3 < μ < 400 днів | 5 ≤ μ ≤ 370 днів |

**Частота підписки** маппиться за середнім інтервалом:

| `avg_interval` (дні) | Frequency |
|---|---|
| 5–10 | weekly |
| 11–18 | biweekly |
| 19–45 | monthly |
| 46–120 | quarterly |
| 121–370 | yearly |

**Активна / неактивна:** `isActive = (now − lastSeen) < avg_interval × 2`.
Якщо підписка пропустила ≥ 2 цикли — вважаємо призупиненою.

**Наступна очікувана дата:** `lastSeen + avg_interval`.

#### Поведінка за періодами місяця

Дні 1–10, 11–20, 21–31 — три bucket-и. Обчислюється середнє витрачання
в кожному buket-i усереднене по місяцях:

```sql
CASE
  WHEN EXTRACT(DAY FROM transaction_time) BETWEEN 1  AND 10 THEN 1
  WHEN EXTRACT(DAY FROM transaction_time) BETWEEN 11 AND 20 THEN 2
  ELSE 3
END AS period
```

Користь — видно "перекос витрат до кінця місяця" (класичний патерн
після зарплати) або навпаки "лінійні витрати".

#### Фінансові звички

Агрегує безліч метрик в одному виклику:

- **Weekend-to-weekday ratio:** `avg_spend_weekend / avg_spend_weekday`
- **Розподіл за часом доби:** `EXTRACT(HOUR FROM time)` у 4 buckets
  (ранок 6–11, день 12–17, вечір 18–22, ніч 23–5)
- **Savings rate:** `(avg_monthly_income − avg_monthly_expense) / avg_monthly_income × 100%`
- **Великі транзакції:** поріг `μ + 2σ` від середньої суми всіх витрат.
  Все вище — вважаємо "аномально великим" (ми повертаємо КІЛЬКІСТЬ та ВІДСОТОК
  таких, а самі рядки вертає endpoint insights).
- **Стабільні категорії:** категорії, які з'являються ≥ 2 місяці поспіль,
  відсортовані за кількістю місяців.

### 3.5. Інсайти

**Модуль:** `modules/insights`

Чотири незалежні детектори + автогенеровані висновки.

#### 1. Аномальні транзакції (z-score per merchant)

```
Для кожного мерчанта:
   μ_m = AVG(ABS(amount)) по transactions з цим merchant
   σ_m = STDDEV(ABS(amount))

Для поточної транзакції:
   z = (|amount| − μ_m) / σ_m

   Якщо z > threshold (default 2.5) → аномалія
```

**Fallback:** якщо мерчант має < 5 транзакцій (мала вибірка, STDDEV ненадійна)
— використовуємо глобальну μ_global та σ_global для всіх транзакцій
користувача. Це ловить "разова велика покупка у невідомому мерчанта".

**Severity mapping:**
- `z > 4` → critical
- `z > 3` → warning
- `z > 2.5` → info

#### 2. Стрибки категорій (category spikes)

Порівнюємо поточний період з **рівним за довжиною** попереднім:

```
period_len = to - from
prev_from = from - period_len
prev_to = from

Для кожної категорії:
   change_pct = (current_sum − previous_sum) / previous_sum × 100
   if change_pct ≥ threshold (default 50%) → spike
```

Нові категорії (previous_sum = 0) автоматично вважаються spike 100%.

#### 3. Нетипові покупки (rare categories)

Категорії, у яких **lifetime count ≤ 3** по всій історії користувача.
Будь-яка транзакція в такій категорії вважається нетиповою — бо користувач
рідко туди витрачає.

#### 4. Автоматичні висновки

Генерується до 6 текстових висновків (Ukrainian templates):

1. **Загальні витрати** за період + порівняння з аналогічним попереднім
2. **Savings** (дохід − витрати) + rate
3. **Головна категорія** (% від загальних витрат)
4. **Найшвидше зростаюча категорія** (якщо growth > 30%)
5. **Найбільша разова витрата**
6. **Merchant diversity** (кількість унікальних мерчантів)

Результати агрегуються в `GET /insights` і сортуються за severity
(critical → warning → info) + датою.

### 3.6. Прогнозування

**Модуль:** `modules/forecasting`

5 алгоритмів прогнозу часових рядів, усі реалізовані **на чистому TypeScript**
без ML-бібліотек — щоб на захисті можна було пояснити кожен рядок.

Вхід: щоденна серія витрат/доходів (gap-filled через `generate_series` —
пропущені дні заповнюються нулями, щоб не збивати moving averages).

**Вихід кожного алгоритму:**
```typescript
interface ForecastResult {
  predicted: number[];    // точковий прогноз на h днів
  lower: number[];        // нижня межа 80% CI
  upper: number[];        // верхня межа 80% CI
  mape: number;           // Mean Absolute Percentage Error на історії
  residualStd: number;    // стандартне відхилення залишків
}
```

**Довірчі інтервали:** 80% (z = 1.28 двосторонній) з масштабуванням √h
(як при random walk — невизначеність росте з горизонтом):

```
band(h) = z · residualStd · √(h + 1)
lower(h) = max(0, predicted(h) − band(h))
upper(h) = predicted(h) + band(h)
```

#### Модель 1: Ковзне середнє (Moving Average)

Найпростіший baseline. Прогноз = середнє з останніх `window` спостережень.

```
ŷ_{t+h} = (1/w) · Σ(y_{t-w+1}..y_t)     для всіх h ≥ 1
```

Плоский прогноз. Добре працює для стабільних, нетрендових серій.

#### Модель 2: Лінійна регресія (Ordinary Least Squares)

```
β = Σ((xi − x̄)(yi − ȳ)) / Σ(xi − x̄)²
α = ȳ − β·x̄

ŷ_{t+h} = α + β·(t + h)
```

Улюлює тренд "витрати ростуть на 50 грн/день". Погано на сезонних даних.

#### Модель 3: Сезонно-наївна (Seasonal Naive)

Для тижневої сезонності (вихідні мають інший рівень витрат):

```
ŷ_{t+h} = y_{t+h-7}          для period = 7
```

Просто "скопіюй той самий день тижня з минулого тижня".

#### Модель 4: Holt's Exponential Smoothing

Рекурентна модель з рівнем (level) та трендом (trend):

```
level_t = α · y_t + (1 − α) · (level_{t-1} + trend_{t-1})
trend_t = β · (level_t − level_{t-1}) + (1 − β) · trend_{t-1}

ŷ_{t+h} = level_t + h · trend_t
```

Параметри за замовчуванням: α = 0.3, β = 0.1 (малі → стабільний прогноз,
адаптивний до тренду, нечутливий до шуму).

Більш потужна ніж лінійна регресія, бо рівень і тренд **адаптуються** з часом —
остання ділянка серії має більшу вагу.

#### Модель 5: Ensemble

Зважена комбінація 4 попередніх:

```
w_i = 1 / max(1, MAPE_i)
w̃_i = w_i / Σw_i                     нормалізація ваги

ŷ_ensemble(h) = Σ(w̃_i · ŷ_i(h))
```

Вага **обернено пропорційна MAPE** — моделі з меншою помилкою мають більший
вплив на підсумковий прогноз. На практиці ensemble майже завжди перемагає
будь-яку окрему модель на new data.

**MAPE (Mean Absolute Percentage Error):**
```
MAPE = (1/n) · Σ |y_i − ŷ_i| / |y_i| · 100%      (тільки де y_i > 0.01)
```

#### Модель 6 (похідна): Cash flow forecast

Прогнозує **баланс**, а не тільки витрати. Алгоритм:

```
1. Прогнозуємо витрати незалежно:    exp_forecast = ensemble(expense_series)
2. Прогнозуємо доходи незалежно:     inc_forecast = ensemble(income_series)
3. net_predicted(h) = inc_forecast.predicted(h) − exp_forecast.predicted(h)
4. Пессимістична межа балансу:       inc.lower(h) − exp.upper(h)
5. Оптимістична межа балансу:        inc.upper(h) − exp.lower(h)
6. Кумулятивно додаємо до currentBalance
```

`willRunOut: bool` — перевіряємо чи прогнозований баланс упаде нижче 0 в межах
горизонту; повертаємо першу таку дату як `runOutDate`.

#### End-of-month projection

Прогноз витрат до кінця поточного місяця:

```
days_remaining = days_in_month − days_elapsed
projected_remaining = Σ(forecast.predicted[0..days_remaining])
projected_total = actual_to_date + projected_remaining

spending_pace = actual_to_date / (avg_daily · days_elapsed)
```

- `spending_pace < 0.9` → "under" (економно)
- `0.9 ≤ spending_pace ≤ 1.1` → "on_track"
- `spending_pace > 1.1` → "over" (перевитрата)

#### Burn rate

Найпростіша метрика — "скільки днів витримає баланс?":

```
net_burn = avg_daily_expense − avg_daily_income
days_until_empty = current_balance / net_burn       (якщо net_burn > 0)
```

Якщо `net_burn ≤ 0` — витрати не перевищують доходів, система stable.

### 3.7. AI-асистент (tool-use)

**Модуль:** `modules/ai-assistant`

Побудований на **AI SDK v6** (Vercel) з підтримкою двох LLM-провайдерів
(OpenAI + Anthropic) та автоматичним перемиканням між ними.

#### Архітектура tool-use

```
Користувач: "чому витрати цього місяця більші?"
    │
    ▼
[ChatService]
    │ завантажує історію з ai_messages
    │
    ▼
streamText({
   model: resolveModel('claude-sonnet-4-6'),
   system: SYSTEM_PROMPT + current_date + schema_hint,
   messages: [history + new user message],
   tools: { search_transactions, get_period_comparison, ... 14 tools },
   stopWhen: stepCountIs(8)
})
    │
    ▼
LLM бачить опис 14 інструментів → вирішує викликати get_period_comparison
    │ {period1From: "2026-03-01", period1To: "2026-03-31",
    │  period2From: "2026-04-01", period2To: "2026-04-18"}
    ▼
[ToolFactoryService]
    │ виклик AnalyticsQueryService.periodComparison(userId, ...)
    │                                             ^-- userId з JWT
    ▼
[AnalyticsRepository]
    │ raw SQL з Redis кешем (1800с TTL)
    │
    ▼
JSON з категоріями + сумами + %change
    │
    ▼
LLM формулює відповідь природною мовою:
"Витрати зросли на 18%. Основні драйвери:
 — **Їжа** ▲ 800 ₴ (+34%)
 — **Транспорт** ▲ 340 ₴ (+18%)..."
    │
    ▼
SSE stream → фронтенд (useChat hook) → рендер у реальному часі
```

**Критичне рішення:** числа завжди приходять з БД, LLM їх тільки форматує.
Це виключає "галюцинації" на сумах — модель може помилитись у тексті, але
не може вигадати суму, якої немає в БД.

#### Зареєстровані tools (14 шт.)

| Tool | Що повертає |
|---|---|
| `search_transactions` | Повнотекст по `merchantNameClean` + `descriptionRaw` (ILIKE) |
| `get_spending_by_category` | Агрегація витрат по категоріях |
| `get_top_merchants` | Топ мерчантів за обсягом |
| `get_monthly_trend` | Витрати/доходи по місяцях |
| `get_period_comparison` | Порівняння двох періодів за категоріями |
| `get_summary` | KPI за поточний місяць |
| `get_income_summary` | Детальна розбивка доходів + топ джерела |
| `get_subscriptions` | Виявлені підписки |
| `get_recurring_expenses` | Повторювані витрати |
| `get_financial_habits` | Агреговані звички |
| `get_insights` | Усі інсайти (anomalies + spikes + ...) |
| `get_end_of_month_projection` | Прогноз до кінця місяця |
| `get_category_forecast` | Прогноз по категоріях |
| `get_burn_rate` | Burn rate |

Кожен tool описаний через **Zod-схему** параметрів, і AI SDK автоматично
конвертує її в JSON Schema для LLM. Функція `execute` викликає відповідний
service з перевіркою доступу за `userId`.

#### Система промптів

System prompt будується динамічно на кожен запит (`buildSystemPrompt()`):

```
## Поточна дата
Сьогодні: **18 квітня 2026 року** (субота), ISO = 2026-04-18.

Готові періоди:
- "цього місяця" → from=2026-04-01, to=2026-04-18
- "минулого місяця" → from=2026-03-01, to=2026-03-31
- ...

## Структура даних
Усі цифри беруться з таблиці `transactions`:
- amount — зі знаком: DEBIT < 0, CREDIT > 0
- transactionType — DEBIT/CREDIT/TRANSFER/HOLD
- ...

## Яким інструментом відповідати
- "скільки я заробив" → get_income_summary
- "чому витрати більші" → get_period_comparison
- ...
```

Це вирішує дві типові проблеми:

1. **Knowledge cutoff моделі:** LLM не знає, який сьогодні день. Без явної
   дати в промпті модель часто бере дату з training data (2024 рік) —
   запити припадають повз реальні дані.
2. **Вибір tool:** 14 інструментів — багато, модель часто плутає
   `get_summary` (тільки поточний місяць) та `get_income_summary` (довільний
   період). Маппінг "питання → tool" значно підвищує точність.

#### Перемикач моделей

Зберігається в `ai_threads.model`. Фронтенд передає через `body.model` у кожному
запиті. `ModelRegistry` маппить id на конкретний провайдер:

```typescript
'claude-sonnet-4-6'  → anthropic('claude-sonnet-4-6')      // default
'claude-opus-4-7'    → anthropic('claude-opus-4-7')
'gpt-4.1-mini'       → openai('gpt-4.1-mini')
'gpt-5'              → openai('gpt-5')
```

Розмова зберігає вибір користувача між ходами — можна змінити модель прямо
посеред чату без втрати контексту.

#### Персистентність розмов

Таблиці `ai_threads` + `ai_messages`. На фронтенді — sidebar з threads
+ автогенерація title з першого user-message (обрізка до 60 символів).

---

## Фронтенд

**Стек:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Recharts 3,
AI SDK React (`useChat`).

### Сторінки

| URL | Що показує |
|---|---|
| `/login`, `/register` | Supabase auth |
| `/setup` | Вибір банку, підключення рахунку, перший sync |
| `/dashboard` | KPI зверху, тренди, топ категорії (client-aggregated) |
| `/dashboard/transactions` | Повна таблиця з фільтрами (дата/тип/категорія) |
| `/dashboard/analytics` | 7 графіків: monthly trend, spending trend, pie по категоріях, day of week, top tables |
| `/dashboard/patterns` | Підписки, регулярні платежі, повторювані, місячні періоди, звички |
| `/dashboard/insights` | Критичні/warning/info картки, фільтри за типом |
| `/dashboard/forecast` | Fan chart з довірчим інтервалом, end-of-month, burn rate, порівняння моделей MAPE |
| `/dashboard/assistant` | AI чат з перемикачем моделей та sidebar-тредами |

### Візуалізація даних

- **Cash flow fan chart** (`/forecast`) — line + shaded area для 80% CI,
  vertical line розділяє history vs forecast. Реалізовано через `ComposedChart`
  Recharts з stacked Area для візуалізації інтервалу.
- **7-day moving average overlay** на daily spending trend — допомагає
  розгледіти тренд крізь шум денних витрат.
- **Category donut** — ділить витрати за місяць, клік відкриває деталі.
- **Markdown у відповідях AI** — через `react-markdown + remark-gfm`,
  кастомні стилі в `globals.css` для `.markdown-body`.

### Стани

Без зовнішніх state-менеджерів. Звичайні React hooks + custom wrappers:
- `useToken()` — localStorage Monobank token
- `useTransactions(filters)` — з loading/error
- `useAnalyticsData(from, to)` — паралельні виклики через Promise.all
- `useChat()` з AI SDK — під капотом тримає стрімінг + message queue

---

## Кешування та інвалідація

Redis використовується на 2 рівнях:

### Рівень 1: референс-дані (довгоживучий)

- `mcc:{code}` — MCC довідник, TTL 24 год, завантажується раз у день.

### Рівень 2: аналітичні запити (змінний TTL)

Кожен ендпоінт має власний TTL, підібраний за характером даних:

| TTL | Коли |
|---|---|
| 300c (5 хв) | `summary` — швидко змінюється при новій транзакції |
| 600c (10 хв) | Топи, категорії — агрегації за мінуту-день |
| 900c (15 хв) | Spending trend, MA — денна гранулярність |
| 1800c (30 хв) | Місячні тренди, порівняння — рідко змінюються |
| 3600c (1 год) | Day-of-week, habits — мають бути стабільні протягом дня |

### Інвалідація після синку

При кожному успішному `ingestNormalized()` викликається:

```typescript
await Promise.all([
  redis.delPattern(`analytics:*:${userId}:*`),
  redis.delPattern(`patterns:*:${userId}:*`),
  redis.delPattern(`insights:*:${userId}:*`),
  redis.delPattern(`forecast:*:${userId}:*`),
]);
```

Використовується Redis `SCAN` (не `KEYS` — блокуюча команда) з батчами по 200.
Це дозволяє миттєво відобразити свіжі транзакції у всіх дашбордах — без
очікування природного TTL.

---

## Безпека

- **JWT-авторизація:** Supabase видає JWT, бекенд валідує через JWKS
  (`@supabase/ssr` на клієнті, `jose` на сервері). Guard `SupabaseGuard`
  прикручений до всіх приватних ендпоінтів.
- **Ізоляція користувачів:** кожен запит до БД фільтрує за `userId`
  (з `request.user.id`, а не з body). Unique constraints та indexes на
  `userId` гарантують що помилково не можна витягти чуже.
- **API keys LLM на бекенді:** `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
  зберігаються в `.env` бекенду, ніколи не передаються клієнту.
  `useChat()` звертається до `/ai/chat`, а бекенд вже викликає LLM.
- **Rate-limit Monobank:** клієнт Monobank самостійно ставить паузу
  60 сек між запитами до `/statement` (вимога API). Це запобігає блокуванню
  токена.
- **Prisma parameterized queries:** усі raw SQL через `Prisma.sql` template —
  значення передаються параметрично, SQL injection неможлива.
- **Валідація DTO:** усі HTTP body проходять через class-validator
  (`ValidationPipe` глобально з `whitelist: true, transform: true`).

---

## Технологічний стек

### Backend (`/backend`)

| Технологія | Версія | Призначення |
|---|---|---|
| NestJS | 11.x | Framework, DI, modules |
| TypeScript | 5.x | Strict mode |
| Prisma | 7.x | ORM + migrations |
| PostgreSQL (Supabase) | 16 | Primary datastore |
| Redis (ioredis) | 5.x | Cache + invalidation |
| AI SDK | 6.x | LLM-абстракція, tool-use |
| @ai-sdk/openai | 3.x | Провайдер OpenAI |
| @ai-sdk/anthropic | 3.x | Провайдер Anthropic |
| Zod | 4.x | Schema validation (у tool-ах) |
| class-validator | 0.14.x | DTO validation |
| jose | 6.x | JWT (Supabase JWKS) |
| axios | 1.x | HTTP для Monobank |

### Frontend (`/frontend`)

| Технологія | Версія | Призначення |
|---|---|---|
| Next.js | 16.x | App Router, RSC |
| React | 19.x | UI |
| Tailwind CSS | 4.x | Styling |
| @base-ui/react | 1.x | Unstyled primitives (tabs, tooltip) |
| Recharts | 3.x | Charting |
| @ai-sdk/react | 3.x | `useChat()` hook зі стрімінгом |
| react-markdown | 10.x | AI response formatting |
| @supabase/ssr | 0.10.x | Auth cookies |

---

## Запуск локально

### 1. Підготовка environment

```bash
# backend/.env
DATABASE_URL="postgresql://..."              # Supabase connection string
DIRECT_URL="postgresql://..."                # Без pgBouncer (для migrations)
SUPABASE_URL="https://xxx.supabase.co"
REDIS_URL="redis://localhost:6379"
MONOBANK_BASE_URL="https://api.monobank.ua"
OPENAI_API_KEY="sk-proj-..."                 # або тільки ANTHROPIC_API_KEY
ANTHROPIC_API_KEY="sk-ant-api03-..."

# frontend/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3000"
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
```

### 2. Бекенд через Docker Compose

```bash
cd backend
docker compose up -d --build

# Міграції застосовуються автоматично (prisma db push) при старті.
# Для production → `npx prisma migrate deploy`.
```

### 3. Фронтенд

```bash
cd frontend
npm install
npm run dev           # http://localhost:3001
```

### 4. Перша синхронізація

1. Відкрити http://localhost:3001 → реєстрація через email/password
2. Отримати токен Monobank на https://api.monobank.ua (personal API)
3. На `/setup` вставити токен → вибрати рахунок → натиснути "Синхронізувати"
4. За 3–5 хв перша партія транзакцій пройде enrichment → аналітика наповниться

---

## Структура репозиторію

```
diploma2/
├── backend/
│   ├── src/
│   │   ├── common/                         спільні enums, utils, interfaces
│   │   ├── auth/                           Supabase JWT guard
│   │   ├── prisma/                         prisma.service
│   │   ├── redis/                          redis.service (з delPattern)
│   │   └── modules/
│   │       ├── accounts/
│   │       ├── analytics/                  11 endpoints
│   │       ├── ai-assistant/               LLM + tool-use
│   │       ├── bank-providers/             Provider registry (strategy)
│   │       ├── forecasting/                5 forecast models
│   │       ├── insights/                   anomalies + spikes + conclusions
│   │       ├── mcc/                        MCC довідник
│   │       ├── merchant-rules/             Rule-based categorizer
│   │       ├── patterns/                   Subscriptions + recurring + habits
│   │       └── transactions/               Sync + upsert + query + Monobank
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/                     Prisma migrations (6 файлів)
│   │   └── seed.ts                         MCC + merchant rules seed
│   ├── docker-compose.yml
│   └── Dockerfile
│
└── frontend/
    ├── src/
    │   ├── app/                            App Router pages
    │   │   └── dashboard/
    │   │       ├── analytics/page.tsx
    │   │       ├── assistant/page.tsx
    │   │       ├── forecast/page.tsx
    │   │       ├── insights/page.tsx
    │   │       ├── patterns/page.tsx
    │   │       ├── transactions/page.tsx
    │   │       └── page.tsx                Dashboard home
    │   ├── components/
    │   │   ├── analytics/                  chart components
    │   │   ├── assistant/                  chat UI
    │   │   ├── dashboard/                  sidebar, nav, summary cards
    │   │   ├── forecasting/                fan chart, projections
    │   │   ├── insights/                   insight cards
    │   │   ├── patterns/                   subscription list, habits card
    │   │   ├── transactions/               filters, table, pagination
    │   │   └── ui/                         shadcn primitives
    │   ├── hooks/                          custom React hooks
    │   ├── lib/
    │   │   ├── api.ts                      all backend calls
    │   │   ├── types.ts                    shared type contracts
    │   │   └── supabase/                   client + server helpers
    │   └── proxy.ts                        middleware (auth gating)
    └── package.json
```

---

## Підсумок: що демонструє магістерська робота

1. **Повний data-pipeline** — від fetch (rate-limited) через normalize +
   enrich (two-stage categorizer) до storage (idempotent upsert з invalidation).
2. **Прикладна аналітика** з нетривіальним SQL — window functions,
   FILTER agregation, two-period single-pass, `EXTRACT`/`DATE_TRUNC`.
3. **Статистичний аналіз** — z-score, coefficient of variation, period-over-period,
   класифікація регулярності за std/mean інтервалів.
4. **Класичне time series forecasting** — 5 моделей (MA, OLS, Seasonal Naive,
   Holt's ES, Ensemble) з довірчими інтервалами, MAPE як критерій якості,
   weighted ensemble.
5. **LLM-інтеграція правильним шляхом** — tool-use / function calling замість
   raw text-to-SQL. Числа з БД, текст від LLM. Multi-provider через AI SDK.
6. **Кешування з інвалідацією** — Redis з TTL per endpoint + `SCAN`-based
   pattern deletion на sync.
7. **Production-grade архітектура** — DDD-style modules, DI через NestJS,
   strong typing через TypeScript + Zod + class-validator, ідентифіковані
   JWT-ізольовані багато користувачів.

Кожен модуль працює самостійно і закриває окрему групу use-cases, а через
AI-асистента об'єднуються в єдиний природномовний інтерфейс поверх усього.
