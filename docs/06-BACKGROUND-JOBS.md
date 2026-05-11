# 06. Background Jobs Architecture

## 1. Queue topology (BullMQ + Redis)

```
BullMQ Queues:
├── transactions          # import, categorize
├── insights             # daily insights generation
├── budgets              # period rollover, health checks
├── forecasting          # nightly projection refresh
├── recommendations      # generation pipeline
├── rules                # rule evaluation
├── notifications        # delivery
├── ai-memory            # consolidation, decay, reflection
├── embeddings           # backfill, refresh
├── analytics-rollups    # materialized view refresh
├── outbox-relay         # transactional outbox publisher
└── dlq                  # dead-letter queue (failed jobs)
```

## 2. Job specifications

### transactions queue

| Job | Trigger | Concurrency | Description |
|---|---|---|---|
| `import-monobank-incremental` | cron (`*/15 * * * *`) | 1 per user | Pull нові транзакції |
| `import-monobank-full` | manual | 1 per user | Initial backfill |
| `categorize-transaction` | event `TransactionImported` | 10 | MCC + ML + LLM categorization |
| `recategorize-batch` | manual | 1 | На запит, коли user править |
| `detect-anomalies-batch` | cron (`0 */6 * * *`) | 5 | Anomaly detection |

### budgets queue

| Job | Trigger | Schedule |
|---|---|---|
| `evaluate-budget-health` | event `TransactionCategorized` | Reactive |
| `close-budget-period` | cron (per budget cadence) | е.g. last-day-of-month 23:59 |
| `start-new-budget-period` | event `BudgetPeriodClosed` | Cascading |
| `apply-rollover-policy` | event `BudgetPeriodClosed` | Cascading |
| `check-threshold-alerts` | event `BudgetLineUpdated` | Reactive |

### forecasting queue

| Job | Trigger | Schedule |
|---|---|---|
| `refresh-cashflow-projection` | cron (`0 2 * * *`) | nightly per user |
| `detect-deficit-windows` | event `CashFlowProjectionUpdated` | Cascading |
| `update-goal-feasibility` | cron (`0 3 * * *`) OR event `GoalContributionMade` | nightly + reactive |
| `recalc-after-significant-change` | event `BudgetCreated` / `GoalCreated` / large transaction | Reactive |

### recommendations queue

| Job | Trigger | Description |
|---|---|---|
| `run-recommendation-pipeline` | cron (`0 * * * *`) + events | Hourly pipeline |
| `generate-rule-based` | sub-step | Rule-based generators |
| `generate-ml-based` | sub-step | ML-based candidates |
| `generate-llm-based` | sub-step | LLM-based candidates |
| `rank-candidates` | sub-step | MCDM ranking |
| `dedup-and-cooldown` | sub-step | Filter near-duplicates |
| `personalize` | sub-step | Templating per user profile |
| `expire-stale-recommendations` | cron (`*/30 * * * *`) | Expire `valid_until < now` |

### rules queue

| Job | Trigger | Concurrency |
|---|---|---|
| `evaluate-rule` | event-driven (per `trigger.event_type`) | 10 |
| `evaluate-scheduled-rules` | cron (`*/5 * * * *`) | 1 |
| `cleanup-rule-executions` | cron (`0 4 * * 0`) weekly | 1 |

### notifications queue

| Job | Trigger | Description |
|---|---|---|
| `dispatch-notification` | event `NotificationQueued` | Channel-specific delivery |
| `send-push` | from `dispatch-notification` | FCM / APNS |
| `send-email` | from `dispatch-notification` | SMTP / Resend |
| `send-telegram` | from `dispatch-notification` | Telegram Bot API |
| `process-receipts` | webhook + cron | Open/click tracking |
| `weekly-digest` | cron (`0 9 * * 1`) | Monday morning summary |

### ai-memory queue

| Job | Trigger | Description |
|---|---|---|
| `consolidate-memory` | cron (`0 3 * * *`) | LLM reflection per user |
| `decay-memory` | cron (`0 4 * * *`) | Reduce importance of old episodic |
| `prune-memory` | cron (`0 5 * * 0`) weekly | Delete < threshold |
| `compress-conversation` | event `AgentSessionEnded` | Summarize long sessions |
| `extract-preferences` | event `RecommendationFeedback` | Learn from accept/reject |

### embeddings queue

| Job | Trigger | Description |
|---|---|---|
| `embed-transaction` | event `TransactionImported` | Generate embedding for description |
| `embed-recommendation` | event `RecommendationGenerated` | For dedup |
| `embed-knowledge-doc` | manual / cron | Index KB |
| `refresh-user-behavior-embedding` | cron (`0 6 * * *`) | Daily behavior model update |

### analytics-rollups queue

| Job | Schedule |
|---|---|
| `refresh-mv-budget-line-status` | `*/5 * * * *` |
| `refresh-mv-monthly-spending` | `0 1 * * *` |
| `refresh-mv-category-trends` | `0 1 * * *` |

### outbox-relay queue

| Job | Schedule | Description |
|---|---|---|
| `relay-outbox` | continuous polling (LISTEN/NOTIFY + fallback every 1s) | Read unprocessed events, publish to BullMQ |

## 3. Cron schedule (consolidated)

```
*/5  * * * *   rules:evaluate-scheduled-rules
*/15 * * * *   transactions:import-monobank-incremental (per user, staggered)
*/30 * * * *   recommendations:expire-stale-recommendations
0    * * * *   recommendations:run-recommendation-pipeline
0  */6 * * *   transactions:detect-anomalies-batch
0    1 * * *   analytics-rollups:refresh-mv-monthly-spending
0    1 * * *   analytics-rollups:refresh-mv-category-trends
0    2 * * *   forecasting:refresh-cashflow-projection
0    3 * * *   forecasting:update-goal-feasibility
0    3 * * *   ai-memory:consolidate-memory
0    4 * * *   ai-memory:decay-memory
0    4 * * 0   rules:cleanup-rule-executions (weekly)
0    5 * * 0   ai-memory:prune-memory (weekly)
0    6 * * *   embeddings:refresh-user-behavior-embedding
0    9 * * 1   notifications:weekly-digest
0    0 1 * *   budgets:close-budget-period (monthly cadence)
```

**Staggering:** для per-user jobs використовувати `user_id mod 60` для розподілу навантаження.

## 4. Worker architecture

```typescript
// src/workers/budgets.worker.ts
@Processor('budgets')
export class BudgetsWorker {
  constructor(
    private readonly budgetService: BudgetService,
    private readonly eventBus: DomainEventBus,
  ) {}

  @Process('evaluate-budget-health')
  async evaluateBudgetHealth(job: Job<EvaluateHealthPayload>) {
    const { budgetId } = job.data;
    const result = await this.budgetService.evaluateHealth(budgetId);
    
    if (result.status === 'EXCEEDED') {
      await this.eventBus.emit({
        type: 'BudgetLineExceededCritical',
        aggregateId: budgetId,
        payload: result,
      });
    }
    
    return result;
  }

  @Process('close-budget-period')
  async closeBudgetPeriod(job: Job<ClosePeriodPayload>) {
    // ...
  }
}
```

## 5. Reliability patterns

### At-least-once delivery
- Outbox publisher гарантує publication
- Consumers ідемпотентні через `event_id` як dedup key

### Retry strategy
```typescript
{
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: false  // зберігати для debugging
}
```

### Dead-letter queue (DLQ)
Після N невдалих attempts → переносити у `dlq` queue з повним context для manual review.

### Circuit breaker
Для external services (OpenAI, Monobank):
```typescript
@CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 })
```

### Rate limiting
- Monobank: 1 request/min per user
- OpenAI: token-bucket algorithm
- Notifications: per-user-per-channel throttling

## 6. Observability

### Metrics (Prometheus-compatible)
- `bullmq_jobs_total{queue, status}`
- `bullmq_job_duration_ms{queue, job_type}` (histogram)
- `bullmq_queue_depth{queue}`
- `bullmq_failed_jobs{queue}`

### Logs
Кожен job додає `correlationId` (= `event_id` якщо event-triggered).

### Traces
OpenTelemetry: span per job, child spans for tool calls + DB ops.

### Dashboards
- Queue health
- Job latency p50/p95/p99
- Failure rate per queue
- Cost (для AI-related jobs)

## 7. Scaling strategy

```
┌────────────────────────────────────────────────┐
│ Application server (Nest)                      │
│  - HTTP API                                    │
│  - WebSocket gateway                           │
│  - Outbox publisher (or separate)              │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ Worker pool 1: Heavy CPU (forecasting,         │
│ simulation, embeddings)                        │
│  Concurrency: 2 per worker                     │
│  Replicas: 2-4                                 │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ Worker pool 2: I/O bound (notifications,       │
│ external APIs)                                 │
│  Concurrency: 20 per worker                    │
│  Replicas: 1-2                                 │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ Worker pool 3: AI-heavy (recommendations,      │
│ memory consolidation)                          │
│  Concurrency: 5 per worker                     │
│  Replicas: 1-3                                 │
│  Cost-aware throttling                         │
└────────────────────────────────────────────────┘
```

## 8. Outbox publisher (детально)

```typescript
@Injectable()
export class OutboxPublisher {
  async run() {
    while (true) {
      const events = await this.repo.getUnprocessedBatch(100);
      
      for (const event of events) {
        await this.tx(async (tx) => {
          // 1. Look up routing rules
          const destinations = this.routing.resolve(event.eventType);
          
          // 2. Insert into outbox per destination
          for (const dest of destinations) {
            await tx.outbox.create({
              eventId: event.id,
              destination: dest,
              status: 'PENDING',
            });
          }
          
          // 3. Mark event as processed
          await tx.domainEvents.markProcessed(event.id);
        });
        
        // 4. Push to BullMQ
        for (const dest of destinations) {
          await this.queues[dest].add(event.eventType, event.payload, {
            jobId: `${event.id}:${dest}`,  // idempotency
          });
        }
      }
      
      await sleep(events.length === 0 ? 1000 : 0);
    }
  }
}
```

## 9. Event routing table

| Event | Destinations |
|---|---|
| `TransactionImported` | `categorization`, `embeddings` |
| `TransactionCategorized` | `budgets`, `insights`, `subscriptions`, `rules` |
| `BudgetLineExceededCritical` | `recommendations`, `notifications` |
| `BudgetPeriodClosed` | `budgets` (rollover), `insights` |
| `GoalCreated` | `forecasting`, `ai-memory` |
| `GoalContributionMade` | `forecasting`, `notifications` |
| `CashFlowDeficitPredicted` | `recommendations`, `notifications` |
| `RecommendationGenerated` | `notifications` |
| `RecommendationFeedback` | `ai-memory`, `recommendations` (learning) |
| `AgentSessionEnded` | `ai-memory` (compress) |
