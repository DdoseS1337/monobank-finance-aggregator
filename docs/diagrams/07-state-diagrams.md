# State Diagrams (FSM Aggregates)

State machines for the aggregates that have explicit lifecycles.

## Budget

```mermaid
stateDiagram-v2
    [*] --> DRAFT : create()
    DRAFT --> ACTIVE : startPeriod()
    ACTIVE --> ACTIVE : addLine() / adjustLine()
    ACTIVE --> ARCHIVED : archive()
    DRAFT --> ARCHIVED : archive()
    ARCHIVED --> [*]
```

State transitions:
- `DRAFT` — створено, але не відкрито жодного періоду; не приймає transactions
- `ACTIVE` — є open period; saga оновлює `spentAmount` lines на кожен `transaction.categorized`
- `ARCHIVED` — soft-delete; історія залишається, нові transactions не зачіпають

---

## BudgetPeriod

```mermaid
stateDiagram-v2
    [*] --> OPEN : startPeriod()
    OPEN --> CLOSED : close() / period.end < now
    CLOSED --> ARCHIVED : after rollover applied
    ARCHIVED --> [*]
```

**Rollover policies** (declared on `Budget.rolloverPolicy`):
- `RESET` — `closingBalance = 0`, наступний період стартує з нуля
- `CARRY_OVER` — `unspent = planned − spent` переходить у opening наступного періоду
- `PARTIAL` — half goes to next period, half to envelope (TBD)

---

## BudgetLine

```mermaid
stateDiagram-v2
    [*] --> OK : create()
    OK --> WARNING : spentPct ≥ thresholdPct (default 80%)
    WARNING --> EXCEEDED : spentPct ≥ 100%
    OK --> EXCEEDED : large single transaction
    WARNING --> OK : adjustPlanned() raises planned
    EXCEEDED --> WARNING : adjustPlanned() raises planned
    EXCEEDED --> EXCEEDED : further spend (no transition)
```

Each transition emits `budget.line.exceeded.warning` / `budget.line.exceeded.critical` events through the outbox.

---

## FinancialGoal

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : create()
    ACTIVE --> PAUSED : pause()
    PAUSED --> ACTIVE : resume()
    ACTIVE --> COMPLETED : currentAmount ≥ targetAmount
    ACTIVE --> ABANDONED : abandon(reason)
    PAUSED --> ABANDONED : abandon(reason)
    COMPLETED --> [*]
    ABANDONED --> [*]

    note right of PAUSED
      contribute() rejected
      Feasibility recalc skipped
    end note

    note right of COMPLETED
      Auto-emitted goal.completed
      Goes to ai-memory queue
    end note
```

---

## Recommendation

```mermaid
stateDiagram-v2
    [*] --> PENDING : pipeline persists
    PENDING --> DELIVERED : Notifications saga<br/>marks as sent
    DELIVERED --> ACCEPTED : user clicks Accept
    DELIVERED --> REJECTED : user clicks Reject
    DELIVERED --> SNOOZED : user snoozes (24h)
    DELIVERED --> EXPIRED : valid_until < now
    PENDING --> EXPIRED : valid_until < now
    SNOOZED --> DELIVERED : snooze expires<br/>(scheduler re-deliver)
    SNOOZED --> EXPIRED : valid_until < now
    ACCEPTED --> [*]
    REJECTED --> [*]
    EXPIRED --> [*]

    note right of REJECTED
      Recorded in feedback,
      blocks similar recs in dedup
      window of 30 days
    end note
```

---

## AgentSession

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : startSession()
    ACTIVE --> ACTIVE : appendTurn(USER) / appendTurn(ASSISTANT) / appendTurn(TOOL)
    ACTIVE --> ENDED : endSession() / inactivity timeout
    ENDED --> [*] : compress to MemoryRecord(EPISODIC)
```

Each turn carries `tokensIn`, `tokensOut`, `costUsd` — rolled up to session totals atomically in [`AgentSessionService.appendTurn`](backend/src/modules/ai/orchestration/agent-session.service.ts).

---

## StagedAction (two-step confirmation)

```mermaid
stateDiagram-v2
    [*] --> PENDING : tool.execute()<br/>stages preview
    PENDING --> CONFIRMED : POST /staged-actions/:id/confirm
    PENDING --> REJECTED : POST /staged-actions/:id/reject
    PENDING --> EXPIRED : expiresAt ≤ now (15m TTL)
    CONFIRMED --> [*] : StagedActionExecutor runs real mutation
    REJECTED --> [*]
    EXPIRED --> [*]
```

---

## Notification

```mermaid
stateDiagram-v2
    [*] --> PENDING : orchestrator.dispatch()
    PENDING --> PENDING : in quiet hours →<br/>reschedule to nextWakeUp
    PENDING --> SENT : channel.send() returns delivered
    PENDING --> FAILED : retryCount ≥ MAX_RETRY
    PENDING --> SKIPPED : unknown channel
    SENT --> [*]
    FAILED --> [*]
    SKIPPED --> [*]

    note right of FAILED
      Retry policy: exponential backoff
      via channel.send → markFailed()
      MAX_RETRY = 5
    end note
```

---

## Rule

```mermaid
stateDiagram-v2
    [*] --> ENABLED : create()
    ENABLED --> DISABLED : disable()
    DISABLED --> ENABLED : enable()
    ENABLED --> [*] : delete()
    DISABLED --> [*] : delete()

    state EXECUTING <<choice>>
    ENABLED --> EXECUTING : event matches trigger
    EXECUTING --> ENABLED : NOT cooling down → AST evaluates<br/>→ run actions → recordExecution()
    EXECUTING --> ENABLED : cooling down → SKIPPED_COOLDOWN
```
