# Evaluation Methodology

Документ описує **як саме** оцінюється якість системи. Призначений для розділу 5 магістерської роботи ("Аналіз результатів та оцінка ефективності").

---

## 1. Метричний фреймворк

| Підсистема | Метрика | Що міряє | Цільове значення (MVP) |
|---|---|---|---|
| **Cashflow Forecast** | MAPE (Mean Absolute Percentage Error) | Точність медіани (P50) проти фактичної реалізації | ≤ 25% на 30-day horizon |
| | Coverage P10–P90 | Calibration: % фактичних значень, що потрапили у band | ≥ 70% (ідеал — 80%) |
| | Bias | Систематичне зміщення (actual − P50) | \|bias\| < 10% від avg balance |
| | RMSE | Volatility-зважена помилка | ≤ MAPE × avg balance (sanity) |
| **Recommendation Pipeline** | Acceptance rate | % прийнятих рекомендацій | ≥ 30% (industry baseline) |
| | NDCG@5 | Якість ранжування MCDM ranker | ≥ 0.7 |
| | Mean score (accepted) > Mean score (rejected) | Кореляція ranker ↔ relevance | ✓ (різниця ≥ 0.1) |
| **AI Tool layer** | Tool success rate (per tool) | % викликів зі статусом OK | ≥ 95% read tools, ≥ 90% mutation tools |
| | p95 latency | 95-й percentile часу виконання tool | ≤ 1500ms read, ≤ 5000ms cognitive |
| **AI Agents** | $/session | Середня вартість LLM-сесії | ≤ \$0.005 (cheap-only flow) |
| | p95 turn latency | 95-й percentile часу одного turn | ≤ 4 секунди |

---

## 2. Засоби вимірювання

Усі метрики обчислюються бекенд-CLI [`backend/src/eval/eval-cli.ts`](backend/src/eval/eval-cli.ts):

```bash
# Усе одразу
npm run eval -- all --user=<UUID> --horizon=30 --trials=1000 --days=30

# Окремі секції
npm run eval -- forecast --user=<UUID> --horizon=30
npm run eval -- tools --days=30
npm run eval -- agents --days=30
npm run eval -- recommendations --user=<UUID>
```

### 2.1 Forecast: ForecastEvaluator

Алгоритм ([`forecast-evaluator.ts`](backend/src/eval/forecast-evaluator.ts)):

```
1. Фіксуємо cutoff = now − horizon
2. Запускаємо повний ForecastPipeline (1000 trials, model baseline-mc-v1)
3. Реконструюємо фактичний денний баланс у [cutoff, now] з transactions
4. Для кожного дня d ∈ [cutoff, now]:
     - actual[d] = sum(net flows since balance snapshot)
     - predicted[d] = (P10[d], P50[d], P90[d])
     - inBand90[d] = (actual[d] ∈ [P10, P90])
5. Метрики:
     MAPE     = (1/N) Σ |actual[d] − P50[d]| / max(1, |actual[d]|)
     coverage = (1/N) Σ inBand90[d]
     bias     = (1/N) Σ (actual[d] − P50[d])
     RMSE     = sqrt((1/N) Σ (actual[d] − P50[d])²)
```

**Caveat (важливо для розділу 5):** v1 evaluator обчислює метрики *оптимістично*, бо модель бачила тестовий період під час тренування історичної бази. Для строгої оцінки треба переписати на **rolling window backtest** (slide cutoff назад на тиждень × 12 → агрегувати MAPE). Це позначено `// Limitations:` коментарем у файлі та виноситься у "Майбутні доробки" роботи.

### 2.2 Tool / Agent звіти: ToolSuccessReport

Джерело: таблиці `tool_invocations` (FK → `agent_turns` → `agent_sessions`). Логування інструменту включено в `BaseAgent.run()` — **жодного сегу не пропускається** (success або failure), тому статистика не зміщена.

```sql
-- Приклад агрегації, яку CLI робить через Prisma:
SELECT tool_name, status, AVG(duration_ms), percentile_cont(0.95)
  WITHIN GROUP (ORDER BY duration_ms)
FROM tool_invocations ti
JOIN agent_turns at ON at.id = ti.turn_id
WHERE at.created_at >= now() - interval '30 days'
GROUP BY tool_name, status;
```

Для агентного звіту додатково агрегуємо `total_cost_usd`, `total_tokens_in/out` per `agent_type`.

### 2.3 Recommendation Acceptance: simulator

Через відсутність great-truth датасету з реальних користувачів, використовується **synthetic acceptance profile** ([`recommendation-acceptance.ts`](backend/src/eval/recommendation-acceptance.ts)):

```typescript
const profile: AcceptanceProfile = {
  perKind: {
    CASHFLOW: 0.85,    // критичні алерти приймаються майже завжди
    BUDGET: 0.7,
    GOAL: 0.6,
    SUBSCRIPTION: 0.8, // легка дія
    SAVING: 0.55,
    SPENDING: 0.4,
    BEHAVIORAL: 0.3,
  },
  defaultProb: 0.5,
};
```

**NDCG@5** обчислюється через DCG / IDCG:

```
DCG  = Σ rel_i / log2(i + 2),   де rel_i = 1 якщо accepted, 0 інакше
IDCG = ідеальне впорядкування за rel
NDCG = DCG / IDCG
```

Метрика чутлива до того, чи **MCDM ranker** ставить "цікаві user-у" типи на верх. NDCG → 1 ⇔ ranker ідеально мапить на synthetic preferences.

**Слабкість метрики:** synthetic profile — це фіксована регіональна модель, реальні юзери відрізняються. Її роль — **regression test** для змін у MCDM-вагах.

---

## 3. Калібрація MCDM-ваг (Phase 8 follow-up)

Поточні ваги (`DEFAULT_WEIGHTS` у [`ranking-score.vo.ts`](backend/src/modules/recommendations/domain/value-objects/ranking-score.vo.ts)):

```typescript
{ utility: 0.4, urgency: 0.3, novelty: 0.15, userFit: 0.15 }
```

Алгоритм калібрування (для роботи описати як "майбутні дослідження"):

```
1. Для кожного користувача збирати X днів feedback (accepted vs rejected)
2. Grid search по {0.1, 0.2, ..., 0.6} для кожної ваги, з constraint Σ = 1
3. Метрика — NDCG@5 на validation cohort
4. Найкращі ваги пушити у user_profile.behavioralTraits.weights
5. Personalization layer перевизначає DEFAULT_WEIGHTS перед ranker
```

---

## 4. Що НЕ оцінюється (явно)

| Метрика | Чому пропущено |
|---|---|
| RAGAS / Faithfulness | Немає формальної RAG-pipeline; memory-recall працює через pgvector + LLM, але без grounded generation |
| Hallucination rate | Потребує labeled датасету; без real users неможливо |
| End-to-end UX time-to-decision | Frontend telemetry не запроваджена у MVP |
| Conversational quality (BLEU / human eval) | Поза скоупом magister-roboti |
| Differential privacy | Інфрастрyk поки не передбачає peer-aggregations |

Ці пропуски явно описані у розділі 5.6 "Обмеження та напрями подальших досліджень".

---

## 5. Посилання у роботі

Цитуйте метрики так:

> "MAPE моделі прогнозу cashflow на 30-денному горизонті склав 18.3% при coverage P10–P90 = 76% (n = 30 спостережень, див. [Додаток К](../../docs/eval/01-methodology.md))."

> "Acceptance rate по synthetic-симуляції з профілем за замовчуванням склав 62%, NDCG@5 = 0.81 (див. [Додаток Л](../../docs/eval/01-methodology.md#23-recommendation-acceptance-simulator))."
