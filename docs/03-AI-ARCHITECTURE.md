# 03. AI-архітектура

## 1. Multi-Agent System

Замість одного AI assistant — **мульти-агентна система** (це сильний академічний наратив).

```
┌──────────────────────────────────────────────────────────┐
│                  Orchestrator Agent                      │
│            (LangGraph supervisor pattern)                │
└─┬──────┬──────┬──────┬──────┬──────┬──────┬─────────────┘
  ▼      ▼      ▼      ▼      ▼      ▼      ▼
Analyst Coach Planner Forecaster Auditor Negotiator Executor
```

| Агент | Роль | Інструменти |
|---|---|---|
| **Analyst** | Q&A, descriptive | text-to-SQL, vector search, charts |
| **Coach** | Поведінкові поради, education | knowledge base, behavior model |
| **Planner** | Створення budgets/goals | budget-tools, goal-tools |
| **Forecaster** | Прогнози, сценарії | cashflow-tools, simulation-tools |
| **Auditor** | Аномалії, fraud, suspicious | anomaly-detection-tools |
| **Negotiator** | Переговори по recommendations (accept/reject/modify) | recommendation-tools |
| **Executor** | Виконання дій (з confirmation) | mutation-tools |

### Patterns

- **Supervisor** (LangGraph) робить routing на основі intent classification
- Кожен sub-agent має свій scratchpad
- Shared blackboard через AI Memory layer
- Inter-agent handoff через explicit messages з context

### LangGraph state machine

```typescript
const supervisorGraph = new StateGraph({
  channels: {
    messages: { value: (x, y) => [...x, ...y], default: () => [] },
    nextAgent: { value: (x, y) => y, default: () => 'analyst' },
    context: { value: (x, y) => ({ ...x, ...y }), default: () => ({}) },
    toolResults: { value: (x, y) => [...x, ...y], default: () => [] },
    finalAnswer: { value: (x, y) => y },
  },
});

// Nodes: supervisor, analyst, coach, planner, forecaster, ...
// Edges: conditional routing з supervisor → sub-agents → back to supervisor
// END: коли supervisor визначає, що відповідь готова
```

## 2. AI Memory Architecture (сильна новизна)

Не просто threads — багатошарова пам'ять.

```
┌─────────────────────────────────────────────────────┐
│                Working Memory                       │
│      (current conversation, short-term)             │
└────────────────────┬────────────────────────────────┘
                     │ compression / summarization
                     ▼
┌─────────────────────────────────────────────────────┐
│              Episodic Memory                        │
│  (events that happened: "user rejected goal X")     │
│  storage: Postgres + pgvector                       │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│              Semantic Memory                        │
│  (facts: "user prefers conservative risk")          │
│  storage: structured facts + vector embeddings      │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│              Procedural Memory                      │
│  (learned playbooks: "for budget overrun, user      │
│   prefers categorical reallocation over goal pause")│
│  storage: Playbook entities                         │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│              External Knowledge Base                │
│  (financial education, MCC reference, regulations)  │
│  storage: pgvector with metadata                    │
└─────────────────────────────────────────────────────┘
```

### Memory orchestration policies

- **Write policies:** що зберігати, важливість, decay
- **Retrieval policies:** top-K + diversity + recency
- **Forgetting:** semantic decay, explicit user control
- **Consolidation:** періодичний LLM-based reflection job, що з episodic будує semantic

### Memory API

```typescript
interface MemoryService {
  write(record: MemoryRecord): Promise<void>;
  recall(query: RecallQuery): Promise<MemoryRecord[]>;
  consolidate(userId: UserId): Promise<ConsolidationReport>;
  forget(filter: ForgetFilter): Promise<void>;
  importance(record: MemoryRecord): Promise<number>;
}

class MemoryRecord {
  id: MemoryRecordId;
  userId: UserId;
  kind: 'semantic' | 'episodic' | 'procedural';
  content: string;
  embedding: Float32Array;          // 1536-dim
  metadata: {
    source: string;                 // 'tool_result' | 'reflection' | 'user_message'
    relatedEntities: string[];      // refs to budgets, goals, etc.
    importance: number;             // 0..1
  };
  createdAt: DateTime;
  accessedAt: DateTime;
  decayFactor: number;              // exponential decay coef
}
```

### Consolidation job (nightly)

1. Take last 24h of episodic memories
2. LLM reflects: "What patterns / preferences / facts emerge?"
3. Promote stable patterns to semantic memory
4. Detect contradictions з existing semantic facts → resolve
5. Update procedural memory з successful patterns
6. Decay old episodic records (importance × decay_factor)

## 3. RAG Pipeline (формалізований)

```
Query → Query Rewriter (LLM) → Multi-Query Generation
     ↓
     ├──► Dense Retrieval (pgvector, embeddings)
     ├──► Sparse Retrieval (BM25 / Postgres FTS)
     └──► Structured Retrieval (SQL fallback)
            ↓
       Hybrid Fusion (RRF — Reciprocal Rank Fusion)
            ↓
       Re-ranker (cross-encoder)
            ↓
       Context Compressor (LLM, prune irrelevant)
            ↓
       Answer Generator (with citations)
            ↓
       Hallucination Guard (claim verification)
```

### Reciprocal Rank Fusion

```
RRF_score(d) = Σᵢ 1 / (k + rankᵢ(d))

де:
- k = 60 (типове значення)
- rankᵢ — позиція документа в i-тому ranker
```

### Chunking strategy

- Semantic chunking (по абзацях / логічних блоках), не fixed-size
- Overlap 10–15% для context preservation
- Metadata: source, section, lang, version, last_updated

## 4. Tool Catalog

Повний список — у `04-AI-TOOL-CATALOG.md`. Тут — структура.

### Tool contract (formal)

```typescript
interface ToolDefinition<TInput, TOutput> {
  name: string;
  category: ToolCategory;          // READ | MUTATION | COGNITIVE | MEMORY
  description: string;             // для LLM
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  authorization: AuthScope[];      // critical for mutations
  sideEffects: SideEffectSpec;     // для guardrails
  cost: CostHint;                  // для tool selection
  execute(input: TInput, ctx: AgentContext): Promise<TOutput>;
}
```

### Two-step confirmation для mutations

Усі mutation tools мають **two-step pattern:**
1. Tool returns "preview" + `staged_action_id`
2. User/agent calls `confirm(staged_action_id)`
3. Тільки тоді відбувається мутація

Академічно описувати як **human-in-the-loop pattern**.

## 5. Tool Orchestration (LangGraph patterns)

Описувати у роботі як state machine:

```
States: PLANNING → TOOL_SELECTION → TOOL_EXECUTION → 
        RESULT_INTERPRETATION → REFLECTION → RESPONSE
        
Transitions guarded by:
- max_iterations (anti-loop)
- cost_budget (cost-aware)
- confidence_threshold (human handoff)
- safety_check (PII / dangerous mutation)
```

### ReAct + Reflexion гібрид

- ReAct цикл: Thought → Action → Observation
- Reflexion: після завершення task — self-evaluation, write to procedural memory
- Plan-and-Execute: для multi-step tasks (e.g., "створи повний плану на квартал")

## 6. Guardrails

### Input guards

- **PII detection** — карткові номери, IBAN, паспорти
- **Prompt injection detection** — heuristics + LLM-based classifier
- **Topic drift detection** — non-financial queries → polite refusal

### Output guards

- **Factuality check** — кожна цифра має бути привʼязана до tool_result
- **Financial advice disclaimer** — для regulated topics
- **Hallucination detector** — claim verification проти retrieved context

### Action guards

- **Mutation confirmation** — обовʼязковий human approval
- **Rate limits** — max N mutations per minute
- **Anomaly detection** — несподівані mutation patterns → block + alert
- **Resource ownership check** — user не може чіпати чужі ресурси

### Privacy guards

- Не лити сирі transactions у LLM, передавати агрегати
- PII redaction перед logging
- Audit log для всіх mutations

## 7. Knowledge Base структура

```
knowledge_documents:
├── financial_education/
│   ├── budgeting_methods/
│   ├── savings_strategies/
│   ├── debt_management/
│   └── investing_basics/
├── domain_reference/
│   ├── mcc_codes/
│   ├── ukrainian_taxes/
│   └── monobank_features/
├── regulatory/
│   └── ukrainian_finance_law/
└── system_help/
    └── feature_documentation/
```

### Indexing

- Embedding model: `text-embedding-3-small` (1536 dim) або open-source альтернатива
- Index: HNSW (m=16, ef_construction=64)
- Hybrid search: dense + Postgres FTS + RRF

## 8. Eval methodology (для розділу 5 роботи)

### RAG metrics (RAGAS)

- **Faithfulness** — наскільки відповідь спирається на retrieved context
- **Answer relevancy** — наскільки відповідь стосується запитання
- **Context precision** — чи релевантні retrieved chunks
- **Context recall** — чи retrieved всі потрібні chunks

### Recommendation metrics

- **Acceptance rate** — % accepted recommendations
- **Diversity** — Jaccard distance між рекомендаціями
- **Novelty** — % унікальних categories
- **Time-to-action** — медіана часу від generation до accept

### Forecasting metrics

- **MAPE** (Mean Absolute Percentage Error)
- **Coverage** — % фактичних значень у P10–P90 range
- **Calibration** — графік prediction vs actual

### AI system metrics

- **Tool call success rate**
- **Average tokens per turn**
- **Cost per session**
- **Latency p50 / p95 / p99**
- **Hallucination rate** (claim verification)
