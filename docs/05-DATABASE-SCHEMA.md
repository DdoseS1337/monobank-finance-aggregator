# 05. Database Schema (нові таблиці)

Описує тільки таблиці, що додаються до існуючої схеми. Existing tables (`users`, `accounts`, `transactions`, `categories`, `mcc_codes`, `subscriptions`, `insights`, `ai_threads` etc.) не дублюються.

## 1. Budgeting Context

```sql
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  method budget_method NOT NULL,    -- ENUM: CATEGORY, ENVELOPE, ZERO_BASED, PYF
  cadence cadence_type NOT NULL,    -- ENUM: WEEKLY, MONTHLY, CUSTOM
  base_currency CHAR(3) NOT NULL,
  rollover_policy rollover_policy NOT NULL DEFAULT 'RESET',
  status budget_status NOT NULL DEFAULT 'DRAFT',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_budgets_user_active ON budgets(user_id) WHERE status = 'ACTIVE';

CREATE TABLE budget_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status period_status NOT NULL DEFAULT 'OPEN',
  opening_balance NUMERIC(18,2),
  closing_balance NUMERIC(18,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_budget_periods_budget ON budget_periods(budget_id, period_start);
CREATE UNIQUE INDEX idx_budget_periods_active ON budget_periods(budget_id) 
  WHERE status = 'OPEN';

CREATE TABLE budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_period_id UUID NOT NULL REFERENCES budget_periods(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id),
  planned_amount NUMERIC(18,2) NOT NULL,
  spent_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  threshold_pct INTEGER NOT NULL DEFAULT 80,
  status line_status NOT NULL DEFAULT 'OK',  -- OK | WARNING | EXCEEDED
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX idx_budget_lines_period ON budget_lines(budget_period_id);
CREATE INDEX idx_budget_lines_category ON budget_lines(category_id);

CREATE TABLE envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  target_balance NUMERIC(18,2),
  color VARCHAR(7),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_envelopes_user ON envelopes(user_id) WHERE archived_at IS NULL;

CREATE TABLE envelope_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id UUID NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL,
  direction movement_direction NOT NULL,   -- IN | OUT | TRANSFER
  source_type VARCHAR(50) NOT NULL,         -- TRANSACTION | RULE | MANUAL | TRANSFER
  source_ref UUID,
  related_envelope_id UUID REFERENCES envelopes(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_envelope_movements_envelope ON envelope_movements(envelope_id, occurred_at DESC);
```

## 2. Goal Planning Context

```sql
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type goal_type NOT NULL,           -- SAVING | DEBT_PAYOFF | INVESTMENT | PURCHASE
  name VARCHAR(255) NOT NULL,
  description TEXT,
  target_amount NUMERIC(18,2) NOT NULL,
  current_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_currency CHAR(3) NOT NULL,
  deadline DATE,
  priority SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  funding_strategy funding_strategy NOT NULL DEFAULT 'FIXED_MONTHLY',
  funding_params JSONB DEFAULT '{}',
  linked_account_id UUID REFERENCES accounts(id),
  status goal_status NOT NULL DEFAULT 'ACTIVE',
  feasibility_score NUMERIC(3,2),
  last_feasibility_calc_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_goals_user_active ON goals(user_id) WHERE status = 'ACTIVE';

CREATE TABLE goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL,
  source_type VARCHAR(50) NOT NULL,  -- MANUAL | RULE | TRANSACTION_LINK | SURPLUS_AUTO
  source_ref UUID,
  made_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_goal_contributions_goal ON goal_contributions(goal_id, made_at DESC);

CREATE TABLE goal_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  threshold_pct SMALLINT NOT NULL,
  reached_at TIMESTAMPTZ,
  reward_text TEXT,
  UNIQUE(goal_id, threshold_pct)
);

CREATE TABLE savings_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  steps JSONB NOT NULL,              -- array of PlanStep
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 3. Cashflow Context

```sql
CREATE TABLE cashflow_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  horizon_days INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_version VARCHAR(50) NOT NULL,
  confidence_score NUMERIC(3,2),
  payload JSONB NOT NULL,            -- Full projection data
  is_latest BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_cashflow_user_latest ON cashflow_projections(user_id) WHERE is_latest = TRUE;

CREATE TABLE projection_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projection_id UUID NOT NULL REFERENCES cashflow_projections(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  balance_p10 NUMERIC(18,2),
  balance_p50 NUMERIC(18,2),
  balance_p90 NUMERIC(18,2),
  expected_inflow NUMERIC(18,2),
  expected_outflow NUMERIC(18,2),
  has_deficit_risk BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_projection_points_proj ON projection_points(projection_id, day);

CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  baseline_projection_id UUID REFERENCES cashflow_projections(id),
  variables JSONB NOT NULL,          -- ScenarioVariable[]
  outcomes JSONB,                    -- Computed outcomes
  computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deficit_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  projection_id UUID NOT NULL REFERENCES cashflow_projections(id),
  predicted_for DATE NOT NULL,
  estimated_amount NUMERIC(18,2) NOT NULL,
  confidence NUMERIC(3,2) NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolution_type VARCHAR(50)
);
CREATE INDEX idx_deficit_user_unresolved ON deficit_predictions(user_id) 
  WHERE resolved_at IS NULL;
```

## 4. Recommendation Context

```sql
CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind recommendation_kind NOT NULL,    -- SPENDING | SAVING | SUBSCRIPTION | BUDGET | GOAL | CASHFLOW | BEHAVIORAL
  priority SMALLINT NOT NULL DEFAULT 3,
  generated_by VARCHAR(50) NOT NULL,    -- 'rules' | 'ml' | 'llm' | 'hybrid'
  generator_metadata JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  status recommendation_status NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL,              -- Recommendation-specific data
  explanation TEXT NOT NULL,
  expected_impact JSONB,                -- { financial: Money, timeframe: Period }
  embedding vector(1536),               -- For similarity-based deduplication
  ranking_score NUMERIC(5,3),
  ranking_breakdown JSONB,              -- weights per criterion
  delivered_at TIMESTAMPTZ,
  delivered_via VARCHAR(50)
);
CREATE INDEX idx_recommendations_user_pending ON recommendations(user_id, generated_at DESC) 
  WHERE status = 'PENDING';
CREATE INDEX idx_recommendations_user_valid ON recommendations(user_id) 
  WHERE valid_until > NOW() AND status = 'PENDING';

CREATE TABLE recommendation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  target_ref VARCHAR(100),              -- "goal:abc123" | "envelope:xyz"
  params JSONB NOT NULL,
  sequence_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  decision VARCHAR(20) NOT NULL,        -- ACCEPTED | REJECTED | MODIFIED | SNOOZED | EXPIRED
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  feedback_text TEXT,
  modifications JSONB,
  applied_at TIMESTAMPTZ
);
CREATE INDEX idx_rec_feedback_user ON recommendation_feedback(user_id, decided_at DESC);

CREATE TABLE playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_pattern JSONB NOT NULL,
  action_template JSONB NOT NULL,
  effectiveness_score NUMERIC(3,2),
  uses_count INTEGER DEFAULT 0,
  is_global BOOLEAN DEFAULT FALSE,
  user_id UUID REFERENCES users(id)     -- NULL для global
);
```

## 5. Rules Context

```sql
CREATE TABLE rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_spec JSONB NOT NULL,
  condition_ast JSONB NOT NULL,
  actions JSONB NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  cooldown_seconds INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_executed_at TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rules_user_enabled ON rules(user_id) WHERE enabled = TRUE;

CREATE TABLE rule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_event JSONB,
  evaluation_result BOOLEAN NOT NULL,
  actions_executed JSONB,
  status VARCHAR(20) NOT NULL,           -- OK | FAILED | SKIPPED_COOLDOWN
  error TEXT,
  duration_ms INTEGER
);
CREATE INDEX idx_rule_executions_rule ON rule_executions(rule_id, triggered_at DESC);
```

## 6. AI Cognition Context

```sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_type VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  total_cost_usd NUMERIC(10,6) DEFAULT 0,
  total_tokens_in INTEGER DEFAULT 0,
  total_tokens_out INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX idx_agent_sessions_user ON agent_sessions(user_id, started_at DESC);

CREATE TABLE agent_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  role VARCHAR(20) NOT NULL,             -- USER | ASSISTANT | TOOL | SYSTEM
  content TEXT,
  tool_calls JSONB,
  reasoning_trace JSONB,
  latency_ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd NUMERIC(10,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, turn_number)
);

CREATE TABLE tool_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id UUID NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL,
  input JSONB NOT NULL,
  output JSONB,
  status VARCHAR(20) NOT NULL,           -- OK | ERROR | CONFIRMATION_REQUIRED
  duration_ms INTEGER,
  error JSONB
);
CREATE INDEX idx_tool_invocations_tool ON tool_invocations(tool_name, status);

CREATE TABLE memory_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind memory_kind NOT NULL,             -- SEMANTIC | EPISODIC | PROCEDURAL
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB DEFAULT '{}',
  importance_score NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  decay_factor NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  source_type VARCHAR(50),
  source_ref UUID,
  related_entities TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count INTEGER NOT NULL DEFAULT 0,
  superseded_by UUID REFERENCES memory_records(id)
);
CREATE INDEX idx_memory_user_kind ON memory_records(user_id, kind) WHERE superseded_by IS NULL;
CREATE INDEX idx_memory_embedding ON memory_records USING hnsw (embedding vector_cosine_ops);

CREATE TABLE knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  section VARCHAR(255),
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB DEFAULT '{}',
  lang CHAR(2) NOT NULL DEFAULT 'uk',
  version VARCHAR(20),
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_kb_lang ON knowledge_documents(lang);
CREATE INDEX idx_kb_embedding ON knowledge_documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_kb_fts ON knowledge_documents 
  USING GIN (to_tsvector('simple', title || ' ' || content));
```

## 7. Personalization Context

```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  risk_tolerance VARCHAR(20) NOT NULL DEFAULT 'MODERATE',
  financial_literacy_level VARCHAR(20) NOT NULL DEFAULT 'INTERMEDIATE',
  behavioral_traits JSONB DEFAULT '{}',
  preferred_tone VARCHAR(20) NOT NULL DEFAULT 'FRIENDLY',
  preferred_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'],
  preferred_language CHAR(2) NOT NULL DEFAULT 'uk',
  quiet_hours JSONB,                     -- { from: "22:00", to: "08:00" }
  embedding vector(384),                  -- behavioral embedding
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  value JSONB NOT NULL,
  source VARCHAR(50) NOT NULL,            -- explicit | inferred | default
  confidence NUMERIC(3,2),
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, domain, key)
);
CREATE INDEX idx_user_prefs_user ON user_preferences(user_id, domain);
```

## 8. Notification Context

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,           -- push | email | in_app | telegram
  kind VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'INFO',  -- INFO | WARNING | CRITICAL
  payload JSONB NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  dedup_key VARCHAR(255),
  recommendation_id UUID REFERENCES recommendations(id),
  retry_count SMALLINT DEFAULT 0,
  error TEXT
);
CREATE INDEX idx_notifications_pending ON notifications(scheduled_for) WHERE status = 'PENDING';
CREATE INDEX idx_notifications_user ON notifications(user_id, scheduled_for DESC);
CREATE INDEX idx_notifications_dedup ON notifications(user_id, dedup_key) 
  WHERE dedup_key IS NOT NULL AND status != 'FAILED';

CREATE TABLE notification_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  action_taken VARCHAR(50)
);
```

## 9. Events / Outbox

```sql
CREATE TABLE domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  event_version SMALLINT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  user_id UUID
);
CREATE INDEX idx_events_aggregate ON domain_events(aggregate_type, aggregate_id, occurred_at);
CREATE INDEX idx_events_unprocessed ON domain_events(occurred_at) WHERE processed_at IS NULL;
CREATE INDEX idx_events_user_time ON domain_events(user_id, occurred_at DESC);

CREATE TABLE outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES domain_events(id) ON DELETE CASCADE,
  destination VARCHAR(100) NOT NULL,      -- queue name
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts SMALLINT NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_outbox_pending ON outbox(created_at) WHERE status = 'PENDING';

CREATE TABLE staged_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  preview JSONB NOT NULL,
  initiated_by VARCHAR(50) NOT NULL,      -- user | agent
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING | CONFIRMED | REJECTED | EXPIRED
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_staged_actions_pending ON staged_actions(user_id, expires_at) 
  WHERE status = 'PENDING';
```

## 10. Materialized views (для performance)

```sql
-- Швидкий аналіз spent per category per active period
CREATE MATERIALIZED VIEW mv_budget_line_status AS
SELECT 
  bl.id AS budget_line_id,
  bl.budget_period_id,
  bl.planned_amount,
  COALESCE(SUM(t.amount), 0) AS actual_spent,
  COUNT(t.id) AS transaction_count,
  CASE 
    WHEN COALESCE(SUM(t.amount), 0) >= bl.planned_amount THEN 'EXCEEDED'
    WHEN COALESCE(SUM(t.amount), 0) >= bl.planned_amount * bl.threshold_pct/100 THEN 'WARNING'
    ELSE 'OK'
  END AS computed_status
FROM budget_lines bl
LEFT JOIN budget_periods bp ON bp.id = bl.budget_period_id
LEFT JOIN transactions t ON t.category_id = bl.category_id 
  AND t.transaction_date BETWEEN bp.period_start AND bp.period_end
GROUP BY bl.id, bl.budget_period_id, bl.planned_amount, bl.threshold_pct;

CREATE INDEX idx_mv_budget_line_status ON mv_budget_line_status(budget_line_id);

-- Refresh: кожні 5 хв через background job
```

## 11. Migrations strategy

Поетапні міграції (Prisma):
1. `add_event_outbox` — domain_events, outbox
2. `add_budgeting` — budgets, periods, lines, envelopes, movements
3. `add_goals` — goals, contributions, milestones, savings_plans
4. `add_cashflow` — projections, points, scenarios, deficits
5. `add_recommendations` — recommendations, actions, feedback, playbooks
6. `add_rules` — rules, executions
7. `add_ai_cognition` — sessions, turns, tool_invocations, memory_records, knowledge_documents
8. `add_personalization` — user_profiles, preferences
9. `add_notifications` — notifications, receipts
10. `add_staged_actions` — for two-step confirmations
11. `add_materialized_views` — for performance

## 12. RLS (Row Level Security)

Усі user-facing таблиці повинні мати RLS policies в Supabase:

```sql
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY budgets_user_isolation ON budgets 
  USING (user_id = auth.uid());

-- І так для всіх таблиць з user_id
```
