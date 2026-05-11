# AI Tool Catalog (canonical)

15 tools, згруповані за `ToolCategory`. Кожен має формальний контракт — `(name, category, description, inputSchema, outputSchema, authorization, sideEffects, execute)` з [`ToolDefinition<TInput, TOutput>`](backend/src/modules/ai/tools/tool.interface.ts).

## READ tools (6)

| name | input | side effects | est. cost |
|---|---|---|---|
| `get_budgets` | `{}` | — | LOW |
| `get_goals` | `{}` | — | LOW |
| `get_cashflow` | `{}` | — | LOW |
| `get_recommendations` | `{}` | — | LOW |
| `get_transactions` | `{ fromDate?, toDate?, type?, limit? }` | — | LOW |
| `get_subscriptions` | `{}` | — | LOW |

**Authorization:** `OWN_DATA`, `requiresConfirmation: false`.
**Files:** [`tools/read/read-tools.ts`](backend/src/modules/ai/tools/read/read-tools.ts)

---

## COGNITIVE tools (4)

| name | input | side effects | est. cost |
|---|---|---|---|
| `run_scenario` | `{ name, variables: ScenarioVariable[] }` | writes Scenario, emits `cashflow.scenario.simulated` | HIGH |
| `explain_recommendation` | `{ recommendationId: uuid }` | — | LOW |
| `recall_memory` | `{ query, topK? }` | — (read pgvector) | MEDIUM |
| `get_cashflow_summary` | `{}` | — | LOW |

**Files:** [`tools/cognitive/cognitive-tools.ts`](backend/src/modules/ai/tools/cognitive/cognitive-tools.ts)

---

## MUTATION tools (5) — two-step confirmation required

| name | input | confirmation? | downstream when confirmed |
|---|---|---|---|
| `create_goal` | `{ type, name, targetAmount, baseCurrency, deadline?, priority?, description? }` | YES | `GoalsService.createGoal` → emits `goal.created` |
| `contribute_to_goal` | `{ goalId, amount, note? }` | YES | `GoalsService.contribute` → emits `goal.contribution.made`, milestone events |
| `adjust_budget_line` | `{ budgetId, lineId, newPlannedAmount }` | YES | `BudgetingService.adjustLine` |
| `accept_recommendation` | `{ recommendationId }` | NO (low-risk) | `RecommendationsService.accept` → emits `recommendation.accepted` |
| `snooze_recommendation` | `{ recommendationId }` | NO | `RecommendationsService.snooze` |

**Two-step pattern:**

```
1) Tool returns ToolResult.error with kind=CONFIRMATION_REQUIRED + stagedActionId + preview
2) Sub-agent surfaces preview to the user in chat
3) User clicks "Підтвердити" → POST /ai/staged-actions/:id/confirm
4) StagedActionsService.confirm() flips PENDING → CONFIRMED
5) StagedActionExecutor.confirmAndExecute() routes by actionType to the
   matching domain service. Single point of "actually mutate" code.
```

**Files:** [`tools/mutation/mutation-tools.ts`](backend/src/modules/ai/tools/mutation/mutation-tools.ts)

---

## Per-agent subset matrix

|             | Analyst | Planner | Forecaster |
|---|:---:|:---:|:---:|
| get_budgets | ✓ | ✓ | — |
| get_goals | ✓ | ✓ | ✓ |
| get_cashflow | ✓ | — | ✓ |
| get_cashflow_summary | ✓ | — | ✓ |
| get_recommendations | ✓ | ✓ | — |
| get_transactions | ✓ | — | — |
| get_subscriptions | ✓ | — | — |
| explain_recommendation | ✓ | — | — |
| recall_memory | ✓ | ✓ | ✓ |
| run_scenario | — | — | ✓ |
| create_goal | — | ✓ | — |
| contribute_to_goal | — | ✓ | — |
| adjust_budget_line | — | ✓ | — |
| accept_recommendation | — | ✓ | — |
| snooze_recommendation | — | ✓ | — |

Tool subsets — це `BaseAgent.toolNames: string[]`; кожен sub-agent оголошує свій список явно. `ToolRegistry.subset(names)` повертає `ToolDefinition[]`, які потім серіалізуються в OpenAI function-calling формат через `toOpenAiFunction()`.

---

## Tool result discriminated union

```typescript
type ToolResult<T> =
  | { ok: true; data: T; metadata?: Record<string, unknown> }
  | { ok: false; error: ToolError; retryable: boolean };

type ToolError =
  | { kind: 'AUTHORIZATION'; message: string }
  | { kind: 'VALIDATION'; field: string; message: string }
  | { kind: 'NOT_FOUND'; resource: string; id: string }
  | { kind: 'RATE_LIMITED'; retryAfterSeconds: number }
  | { kind: 'CONFIRMATION_REQUIRED'; stagedActionId: string; preview: unknown }
  | { kind: 'CONFLICT'; conflictingResource: string }
  | { kind: 'EXTERNAL'; service: string; details: string }
  | { kind: 'INTERNAL'; correlationId: string };
```

Жоден tool НЕ кидає винятки — усі помилки повертаються типобезпечно. `BaseAgent.statusFromResult()` мапить kind у `agent_turns.tool_invocations.status` (`OK | ERROR | CONFIRMATION_REQUIRED`).

---

## Audit trail

Кожен виклик інструмента пише запис у `tool_invocations` (FK → `agent_turns` → `agent_sessions`). Зберігаються:

- `toolName` — для агрегації по типу
- `input` / `output` — для debugging
- `status` — `OK`, `ERROR`, `CONFIRMATION_REQUIRED`
- `durationMs` — латенція виконання

Звідси беруться метрики **tool success rate** (див. `eval/tool-success-rate.ts`).
