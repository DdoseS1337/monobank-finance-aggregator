# C4 — Components: AI Cognition Context

Internal structure of the AI module: supervisor + sub-agents + tool catalog
+ memory layer + guardrails.

```mermaid
%%{init: {'theme':'neutral'}}%%
flowchart TB
    user["User message<br/>(POST /ai/chat)"]:::ext

    subgraph ai [AI Module]
        guard["GuardrailsService<br/>- PII redaction<br/>- prompt-injection refuse<br/>- topic-drift refuse"]:::guard

        chat["AiChatService<br/>(orchestrator)"]:::svc
        sess["AgentSessionService<br/>persist sessions, turns,<br/>tool_invocations + cost"]:::svc

        sup["SupervisorAgent<br/>1) keyword routing<br/>2) LLM JSON-schema fallback"]:::sup

        analyst["AnalystAgent<br/>(read-only Q&A)"]:::sub
        planner["PlannerAgent<br/>(state changes via two-step)"]:::sub
        forecaster["ForecasterAgent<br/>(scenarios + cashflow)"]:::sub

        registry["ToolRegistry<br/>20+ tools"]:::reg
        catres["CategoryResolverService<br/>(layered: alias /<br/>substring / semantic)"]:::svc
        staged["StagedActionsService<br/>preview / confirm / expire<br/>(payload dedupe)"]:::svc
        executor["StagedActionExecutor<br/>routes confirmed payload<br/>→ Goals/Budgeting services"]:::svc

        verifier["VerificationService (V2)<br/>extract numeric claims<br/>+ transitive grounding<br/>+ retry loop"]:::ver

        memory["MemoryModule<br/>(EPISODIC / SEMANTIC /<br/>PROCEDURAL)"]:::mem
    end

    user --> guard --> chat
    chat --> sess
    chat --> sup
    sup --> analyst
    sup --> planner
    sup --> forecaster

    analyst --> registry
    planner --> registry
    forecaster --> registry

    analyst -. "final draft" .-> verifier
    planner -. "final draft" .-> verifier
    forecaster -. "final draft" .-> verifier
    verifier -. "✓ pass / ✗ retry with offending claims" .-> analyst
    verifier -. "✓ pass / ✗ retry" .-> planner
    verifier -. "✓ pass / ✗ retry" .-> forecaster

    planner -. "ALLOCATE/CREATE_*<br/>→ stage()" .-> staged
    planner -. "categoryId hint<br/>(UUID/slug/name)" .-> catres
    user -. "POST /ai/staged-actions/:id/confirm" .-> executor
    staged --> executor

    analyst -. "recall_memory" .-> memory
    chat -. "writeEpisodic on feedback" .-> memory

    classDef ext fill:#f3f4f6,stroke:#6b7280
    classDef guard fill:#fee2e2,stroke:#b91c1c
    classDef svc fill:#dbeafe,stroke:#1d4ed8
    classDef sup fill:#fef3c7,stroke:#b45309
    classDef sub fill:#d1fae5,stroke:#047857
    classDef reg fill:#f3e8ff,stroke:#7c3aed
    classDef mem fill:#fce7f3,stroke:#be185d
    classDef ver fill:#fef9c3,stroke:#a16207
```

## Tool subset per agent (актуально на момент thesis)

| Agent | Read | Cognitive / Memory | Mutation |
|---|---|---|---|
| Analyst | get_budgets, get_categories, get_goals, get_cashflow, get_recommendations, get_transactions, get_subscriptions, get_fx_rate | get_cashflow_summary, explain_recommendation, **explain_spending_change** (V3), **lookup_education** (RAG), **calculate**, recall_memory | — |
| Planner | get_goals, get_budgets, get_categories, get_recommendations, get_fx_rate | **lookup_education** (RAG), **calculate**, recall_memory | create_goal, **create_budget**, **add_budget_line**, **archive_budget**, contribute_to_goal, adjust_budget_line, accept_recommendation, snooze_recommendation |
| Forecaster | get_cashflow, get_cashflow_summary, get_goals, get_fx_rate | run_scenario, **lookup_education** (RAG), **calculate**, recall_memory | — |

**Жирним** — нові tools, додані пізніше у Phase 4–6 (V2/V3/RAG).

Усі mutation tools повертають `CONFIRMATION_REQUIRED + stagedActionId`; реальна мутація відбувається коли user викликає `POST /ai/staged-actions/:id/confirm`.

## Memory layer

```mermaid
%%{init: {'theme':'neutral'}}%%
flowchart LR
    working["Working memory<br/>(in-context, per session)"]
    episodic["Episodic memory<br/>(per event)"]
    semantic["Semantic memory<br/>(stable facts)"]
    procedural["Procedural memory<br/>(playbooks)"]

    working -- "compress on session.end" --> episodic
    episodic -- "nightly LLM<br/>reflection" --> semantic
    semantic -- "decay 5%/night<br/>+ supersedes" --> semantic
    episodic -- "low importance<br/>→ decay → prune" --> episodic
```

- Реалізація reflection: [`MemoryConsolidationService`](backend/src/modules/ai/memory/application/consolidation.service.ts) — крон @ 03:00 UTC
- Decay: [`MemoryDecayService`](backend/src/modules/ai/memory/application/decay.service.ts) — крон @ 04:00 UTC
- Procedural memory зберігається через `Playbook` модель і поки що population manual / TBD у Phase 8
