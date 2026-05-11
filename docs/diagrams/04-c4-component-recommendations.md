# C4 — Components: Recommendation Engine

```mermaid
%%{init: {'theme':'neutral'}}%%
flowchart TB
    triggers["Triggers<br/>- @Cron hourly<br/>- recommendations queue<br/>(events: budget exceeded,<br/>cashflow deficit, goal at-risk,<br/>rule.recommendation.requested)"]:::trig

    subgraph pipe [RecommendationPipeline]
        ctx["ContextBuilderService<br/>SELECT(accounts, budgets, goals,<br/>cashflow, subs, recent spend)"]:::svc
        rules["RuleBasedGenerator<br/>(deterministic signals)"]:::gen
        llm["LlmGenerator<br/>(memory + context →<br/>JSON-schema response)"]:::gen
        embed["EmbeddingService<br/>batch embed candidate<br/>explanations"]:::svc
        dedup["Deduplicator<br/>1) intra-batch sig<br/>2) cross-history<br/>vector similarity"]:::svc
        ranker["RecommendationRanker<br/>MCDM:<br/>0.4·utility + 0.3·urgency<br/>+ 0.15·novelty + 0.15·userFit"]:::svc
        topN["Top-N filter (6)"]:::svc
        repo["RecommendationRepository<br/>save + emit<br/>recommendation.generated"]:::repo
    end

    feedback["User: accept / reject / snooze<br/>↓<br/>recommendations.saga<br/>↓<br/>writeEpisodic memory<br/>+ next dedup blocks twins"]:::feedback

    triggers --> pipe
    ctx --> rules
    ctx --> llm
    rules --> embed
    llm --> embed
    embed --> dedup
    dedup --> ranker
    ranker --> topN
    topN --> repo

    repo -.-> feedback

    classDef trig fill:#fef3c7,stroke:#b45309
    classDef svc fill:#dbeafe,stroke:#1d4ed8
    classDef gen fill:#d1fae5,stroke:#047857
    classDef repo fill:#fce7f3,stroke:#be185d
    classDef feedback fill:#f3e8ff,stroke:#7c3aed
```

## Generator characteristics

| | RuleBasedGenerator | LlmGenerator |
|---|---|---|
| Latency | < 50ms (pure SQL) | 800-2500ms (LLM call) |
| Cost | $0 | ~$0.0001 per run (gpt-4o-mini) |
| Output kinds | BUDGET / CASHFLOW / GOAL / SUBSCRIPTION | SPENDING / SAVING / BEHAVIORAL |
| Determinism | повний | стохастичний (temp=0.5) |
| Bypass when | завжди працює | OPENAI_API_KEY не set → returns [] |

## Ranking formula

```
total = w_utility · utility(c) + w_urgency · urgency(c)
      + w_novelty · novelty(c) + w_userFit · user_fit(c)

де:
  utility   ∈ [0,1] — financial impact (cap 10000 ₴ → 1.0)
  urgency   ∈ [0,1] — derived from priority + days_until_expiration
  novelty   = 1 − max_similarity_to_recent_30d
  user_fit  = cosine(c.embedding, accepted_centroid)

weights default: { 0.4, 0.3, 0.15, 0.15 }
```

Вагові коефіцієнти зберігаються у `RankingScore.weights` поряд з breakdown — UI показує їх на запит "Чому саме ця рекомендація?".

## Closed feedback loop

1. User натискає `Accept` → `recommendation.accepted` подія через outbox
2. `RecommendationsSaga` (queue: `recommendations`) ловить подію → пише episodic memory ("user accepted X kind Y")
3. Наступна `recall_memory` викличе цю запис → LLM-generator адаптує рекомендації
4. `acceptedCentroid()` оновлюється → `userFit` ранжування зміщується до прийнятих профілів

Описати у роботі як *"hybrid recommender з explicit feedback loop та adaptive personalization через memory"*.
