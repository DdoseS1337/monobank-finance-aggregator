-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT', 'CASH', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('DEBIT', 'CREDIT', 'TRANSFER', 'HOLD');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('PENDING', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "budget_method" AS ENUM ('CATEGORY', 'ENVELOPE', 'ZERO_BASED', 'PAY_YOURSELF_FIRST');

-- CreateEnum
CREATE TYPE "cadence" AS ENUM ('WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "rollover_policy" AS ENUM ('CARRY_OVER', 'RESET', 'PARTIAL');

-- CreateEnum
CREATE TYPE "budget_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "period_status" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "budget_line_status" AS ENUM ('OK', 'WARNING', 'EXCEEDED');

-- CreateEnum
CREATE TYPE "movement_direction" AS ENUM ('IN', 'OUT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "goal_type" AS ENUM ('SAVING', 'DEBT_PAYOFF', 'INVESTMENT', 'PURCHASE');

-- CreateEnum
CREATE TYPE "funding_strategy" AS ENUM ('FIXED_MONTHLY', 'PERCENTAGE_INCOME', 'SURPLUS');

-- CreateEnum
CREATE TYPE "goal_status" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "recommendation_kind" AS ENUM ('SPENDING', 'SAVING', 'SUBSCRIPTION', 'BUDGET', 'GOAL', 'CASHFLOW', 'BEHAVIORAL');

-- CreateEnum
CREATE TYPE "recommendation_status" AS ENUM ('PENDING', 'DELIVERED', 'ACCEPTED', 'REJECTED', 'MODIFIED', 'SNOOZED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "memory_kind" AS ENUM ('SEMANTIC', 'EPISODIC', 'PROCEDURAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "type" "account_type" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "external_id" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "description" TEXT,
    "merchant_name" TEXT,
    "mcc_code" INTEGER,
    "category_id" UUID,
    "type" "transaction_type" NOT NULL,
    "status" "transaction_status" NOT NULL DEFAULT 'POSTED',
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "is_anomaly" BOOLEAN NOT NULL DEFAULT false,
    "anomaly_score" DECIMAL(3,2),
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcc_mappings" (
    "mcc_code" INTEGER NOT NULL,
    "category_id" UUID NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(3,2) NOT NULL DEFAULT 1,

    CONSTRAINT "mcc_mappings_pkey" PRIMARY KEY ("mcc_code")
);

-- CreateTable
CREATE TABLE "merchant_rules" (
    "id" UUID NOT NULL,
    "pattern" TEXT NOT NULL,
    "match_type" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "merchant_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "merchant_name" TEXT NOT NULL,
    "estimated_amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "cadence" TEXT NOT NULL,
    "next_due_date" TIMESTAMP(3),
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_charged_at" TIMESTAMP(3),
    "status" "subscription_status" NOT NULL DEFAULT 'ACTIVE',
    "is_essential" BOOLEAN NOT NULL DEFAULT false,
    "unused_days_count" INTEGER,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "period" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "method" "budget_method" NOT NULL,
    "cadence" "cadence" NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "rollover_policy" "rollover_policy" NOT NULL DEFAULT 'RESET',
    "status" "budget_status" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_periods" (
    "id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" "period_status" NOT NULL DEFAULT 'OPEN',
    "opening_balance" DECIMAL(18,2),
    "closing_balance" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" UUID NOT NULL,
    "budget_period_id" UUID NOT NULL,
    "category_id" UUID,
    "planned_amount" DECIMAL(18,2) NOT NULL,
    "spent_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "threshold_pct" INTEGER NOT NULL DEFAULT 80,
    "status" "budget_line_status" NOT NULL DEFAULT 'OK',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envelopes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "target_balance" DECIMAL(18,2),
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envelope_movements" (
    "id" UUID NOT NULL,
    "envelope_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "direction" "movement_direction" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_ref" UUID,
    "related_envelope_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envelope_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "goal_type" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target_amount" DECIMAL(18,2) NOT NULL,
    "current_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "base_currency" CHAR(3) NOT NULL,
    "deadline" DATE,
    "priority" SMALLINT NOT NULL DEFAULT 3,
    "funding_strategy" "funding_strategy" NOT NULL DEFAULT 'FIXED_MONTHLY',
    "funding_params" JSONB NOT NULL DEFAULT '{}',
    "linked_account_id" UUID,
    "status" "goal_status" NOT NULL DEFAULT 'ACTIVE',
    "feasibility_score" DECIMAL(3,2),
    "last_feasibility_calc_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_contributions" (
    "id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_ref" UUID,
    "made_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_milestones" (
    "id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "threshold_pct" SMALLINT NOT NULL,
    "reached_at" TIMESTAMP(3),
    "reward_text" TEXT,

    CONSTRAINT "goal_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashflow_projections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model_version" TEXT NOT NULL,
    "confidence_score" DECIMAL(3,2),
    "payload" JSONB NOT NULL,
    "is_latest" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cashflow_projections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projection_points" (
    "id" UUID NOT NULL,
    "projection_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "balance_p10" DECIMAL(18,2),
    "balance_p50" DECIMAL(18,2),
    "balance_p90" DECIMAL(18,2),
    "expected_inflow" DECIMAL(18,2),
    "expected_outflow" DECIMAL(18,2),
    "has_deficit_risk" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "projection_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "baseline_projection_id" UUID,
    "variables" JSONB NOT NULL,
    "outcomes" JSONB,
    "computed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deficit_predictions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "projection_id" UUID NOT NULL,
    "predicted_for" DATE NOT NULL,
    "estimated_amount" DECIMAL(18,2) NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolution_type" TEXT,

    CONSTRAINT "deficit_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "recommendation_kind" NOT NULL,
    "priority" SMALLINT NOT NULL DEFAULT 3,
    "generated_by" TEXT NOT NULL,
    "generator_metadata" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "status" "recommendation_status" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "expected_impact" JSONB,
    "embedding" vector(1536),
    "ranking_score" DECIMAL(5,3),
    "ranking_breakdown" JSONB,
    "delivered_at" TIMESTAMP(3),
    "delivered_via" TEXT,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_actions" (
    "id" UUID NOT NULL,
    "recommendation_id" UUID NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_ref" TEXT,
    "params" JSONB NOT NULL,
    "sequence_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "recommendation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_feedback" (
    "id" UUID NOT NULL,
    "recommendation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedback_text" TEXT,
    "modifications" JSONB,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "recommendation_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playbooks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_pattern" JSONB NOT NULL,
    "action_template" JSONB NOT NULL,
    "effectiveness_score" DECIMAL(3,2),
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "user_id" UUID,

    CONSTRAINT "playbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_spec" JSONB NOT NULL,
    "condition_ast" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_executed_at" TIMESTAMP(3),
    "execution_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_executions" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger_event" JSONB,
    "evaluation_result" BOOLEAN NOT NULL,
    "actions_executed" JSONB,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "duration_ms" INTEGER,

    CONSTRAINT "rule_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agent_type" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "total_cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "total_tokens_in" INTEGER NOT NULL DEFAULT 0,
    "total_tokens_out" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_turns" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT,
    "tool_calls" JSONB,
    "reasoning_trace" JSONB,
    "latency_ms" INTEGER,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "cost_usd" DECIMAL(10,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_invocations" (
    "id" UUID NOT NULL,
    "turn_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "error" JSONB,

    CONSTRAINT "tool_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "memory_kind" NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "importance_score" DECIMAL(3,2) NOT NULL DEFAULT 0.5,
    "decay_factor" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    "source_type" TEXT,
    "source_ref" UUID,
    "related_entities" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "superseded_by" UUID,

    CONSTRAINT "memory_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "section" TEXT,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lang" CHAR(2) NOT NULL DEFAULT 'uk',
    "version" TEXT,
    "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "risk_tolerance" TEXT NOT NULL DEFAULT 'MODERATE',
    "financial_literacy_level" TEXT NOT NULL DEFAULT 'INTERMEDIATE',
    "behavioral_traits" JSONB NOT NULL DEFAULT '{}',
    "preferred_tone" TEXT NOT NULL DEFAULT 'FRIENDLY',
    "preferred_channels" TEXT[] DEFAULT ARRAY['in_app']::TEXT[],
    "preferred_language" CHAR(2) NOT NULL DEFAULT 'uk',
    "quiet_hours" JSONB,
    "embedding" vector(384),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DECIMAL(3,2),
    "set_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "payload" JSONB NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dedup_key" TEXT,
    "recommendation_id" UUID,
    "retry_count" SMALLINT NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_receipts" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "action_taken" TEXT,

    CONSTRAINT "notification_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_version" SMALLINT NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "user_id" UUID,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "last_attempted_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staged_actions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "initiated_by" TEXT NOT NULL,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "staged_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_external_id_key" ON "accounts"("provider", "external_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_transaction_date_idx" ON "transactions"("user_id", "transaction_date" DESC);

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_is_anomaly_idx" ON "transactions"("user_id", "is_anomaly");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_account_id_external_id_key" ON "transactions"("account_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "merchant_rules_enabled_priority_idx" ON "merchant_rules"("enabled", "priority");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "insights_user_id_generated_at_idx" ON "insights"("user_id", "generated_at" DESC);

-- CreateIndex
CREATE INDEX "budgets_user_id_status_idx" ON "budgets"("user_id", "status");

-- CreateIndex
CREATE INDEX "budget_periods_budget_id_period_start_idx" ON "budget_periods"("budget_id", "period_start");

-- CreateIndex
CREATE INDEX "budget_lines_budget_period_id_idx" ON "budget_lines"("budget_period_id");

-- CreateIndex
CREATE INDEX "budget_lines_category_id_idx" ON "budget_lines"("category_id");

-- CreateIndex
CREATE INDEX "envelopes_user_id_idx" ON "envelopes"("user_id");

-- CreateIndex
CREATE INDEX "envelope_movements_envelope_id_occurred_at_idx" ON "envelope_movements"("envelope_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "goals_user_id_status_idx" ON "goals"("user_id", "status");

-- CreateIndex
CREATE INDEX "goal_contributions_goal_id_made_at_idx" ON "goal_contributions"("goal_id", "made_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "goal_milestones_goal_id_threshold_pct_key" ON "goal_milestones"("goal_id", "threshold_pct");

-- CreateIndex
CREATE INDEX "cashflow_projections_user_id_is_latest_idx" ON "cashflow_projections"("user_id", "is_latest");

-- CreateIndex
CREATE INDEX "projection_points_projection_id_day_idx" ON "projection_points"("projection_id", "day");

-- CreateIndex
CREATE INDEX "deficit_predictions_user_id_resolved_at_idx" ON "deficit_predictions"("user_id", "resolved_at");

-- CreateIndex
CREATE INDEX "recommendations_user_id_status_generated_at_idx" ON "recommendations"("user_id", "status", "generated_at" DESC);

-- CreateIndex
CREATE INDEX "recommendation_feedback_user_id_decided_at_idx" ON "recommendation_feedback"("user_id", "decided_at" DESC);

-- CreateIndex
CREATE INDEX "rules_user_id_enabled_idx" ON "rules"("user_id", "enabled");

-- CreateIndex
CREATE INDEX "rule_executions_rule_id_triggered_at_idx" ON "rule_executions"("rule_id", "triggered_at" DESC);

-- CreateIndex
CREATE INDEX "agent_sessions_user_id_started_at_idx" ON "agent_sessions"("user_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "agent_turns_session_id_turn_number_key" ON "agent_turns"("session_id", "turn_number");

-- CreateIndex
CREATE INDEX "tool_invocations_tool_name_status_idx" ON "tool_invocations"("tool_name", "status");

-- CreateIndex
CREATE INDEX "memory_records_user_id_kind_idx" ON "memory_records"("user_id", "kind");

-- CreateIndex
CREATE INDEX "knowledge_documents_lang_idx" ON "knowledge_documents"("lang");

-- CreateIndex
CREATE INDEX "user_preferences_user_id_domain_idx" ON "user_preferences"("user_id", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_domain_key_key" ON "user_preferences"("user_id", "domain", "key");

-- CreateIndex
CREATE INDEX "notifications_scheduled_for_status_idx" ON "notifications"("scheduled_for", "status");

-- CreateIndex
CREATE INDEX "notifications_user_id_scheduled_for_idx" ON "notifications"("user_id", "scheduled_for" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_dedup_key_idx" ON "notifications"("user_id", "dedup_key");

-- CreateIndex
CREATE INDEX "domain_events_aggregate_type_aggregate_id_occurred_at_idx" ON "domain_events"("aggregate_type", "aggregate_id", "occurred_at");

-- CreateIndex
CREATE INDEX "domain_events_processed_at_idx" ON "domain_events"("processed_at");

-- CreateIndex
CREATE INDEX "domain_events_user_id_occurred_at_idx" ON "domain_events"("user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "outbox_status_created_at_idx" ON "outbox"("status", "created_at");

-- CreateIndex
CREATE INDEX "staged_actions_user_id_status_expires_at_idx" ON "staged_actions"("user_id", "status", "expires_at");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcc_mappings" ADD CONSTRAINT "mcc_mappings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_periods" ADD CONSTRAINT "budget_periods_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_period_id_fkey" FOREIGN KEY ("budget_period_id") REFERENCES "budget_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_envelope_id_fkey" FOREIGN KEY ("envelope_id") REFERENCES "envelopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_related_envelope_id_fkey" FOREIGN KEY ("related_envelope_id") REFERENCES "envelopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_linked_account_id_fkey" FOREIGN KEY ("linked_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_plans" ADD CONSTRAINT "savings_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflow_projections" ADD CONSTRAINT "cashflow_projections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projection_points" ADD CONSTRAINT "projection_points_projection_id_fkey" FOREIGN KEY ("projection_id") REFERENCES "cashflow_projections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_baseline_projection_id_fkey" FOREIGN KEY ("baseline_projection_id") REFERENCES "cashflow_projections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deficit_predictions" ADD CONSTRAINT "deficit_predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deficit_predictions" ADD CONSTRAINT "deficit_predictions_projection_id_fkey" FOREIGN KEY ("projection_id") REFERENCES "cashflow_projections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_actions" ADD CONSTRAINT "recommendation_actions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "agent_turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "memory_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "domain_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staged_actions" ADD CONSTRAINT "staged_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
