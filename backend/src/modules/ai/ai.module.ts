import { Module } from '@nestjs/common';
import { MemoryModule } from './memory/memory.module';

import { AiChatController } from './presentation/ai-chat.controller';
import { AiChatService } from './application/ai-chat.service';

import { GuardrailsService } from './guardrails/guardrails.service';
import { AgentSessionService } from './orchestration/agent-session.service';
import { StagedActionsService } from './orchestration/staged-actions.service';
import { VerificationService } from './verification/verification.service';

import { ToolRegistry } from './tools/tool-registry';
import { CategoryResolverService } from './tools/category-resolver.service';

import {
  GetBudgetsTool,
  GetCashflowTool,
  GetCategoriesTool,
  GetFxRateTool,
  GetGoalsTool,
  GetRecommendationsTool,
  GetSubscriptionsTool,
  GetTransactionsTool,
} from './tools/read/read-tools';
import {
  CalculateTool,
  ExplainRecommendationTool,
  ExplainSpendingChangeTool,
  GetCashflowSummaryTool,
  LookupEducationTool,
  RecallMemoryTool,
  RunScenarioTool,
} from './tools/cognitive/cognitive-tools';
import {
  AbandonGoalTool,
  AcceptRecommendationTool,
  AddBudgetLineTool,
  AdjustBudgetLineTool,
  ArchiveBudgetTool,
  ContributeToGoalTool,
  CreateBudgetTool,
  CreateGoalTool,
  PauseGoalTool,
  ResumeGoalTool,
  SnoozeRecommendationTool,
  StagedActionExecutor,
  UpdateGoalTool,
} from './tools/mutation/mutation-tools';

import { AnalystAgent } from './agents/analyst.agent';
import { PlannerAgent } from './agents/planner.agent';
import { ForecasterAgent } from './agents/forecaster.agent';
import { SupervisorAgent } from './agents/supervisor';

import { GoalsModule } from '../goals/goals.module';
import { BudgetingModule } from '../budgeting/budgeting.module';
import { CashflowModule } from '../cashflow/cashflow.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { FxModule } from '../fx/fx.module';
import { EducationModule } from '../education/education.module';
import { TransactionsModule } from '../transactions/transactions.module';

/**
 * AI Cognition Context — Phase 4 (complete).
 *
 * Composes:
 *   - MemoryModule (4.2) — episodic / semantic / procedural memory
 *   - Multi-agent (4.1) — Supervisor + Analyst / Planner / Forecaster
 *   - Tools — read / cognitive / mutation (with two-step confirmation)
 *   - Guardrails — PII redaction + prompt-injection refusal
 *
 * Mutation tools delegate to GoalsService / BudgetingService — hence the
 * imports of those modules. We use forwardRef on RecommendationsModule
 * because it imports AiModule (for MemoryService).
 */
@Module({
  imports: [
    MemoryModule,
    GoalsModule,
    BudgetingModule,
    CashflowModule,
    RecommendationsModule,
    FxModule,
    EducationModule,
    TransactionsModule,
  ],
  controllers: [AiChatController],
  providers: [
    AiChatService,
    GuardrailsService,
    AgentSessionService,
    StagedActionsService,
    StagedActionExecutor,
    VerificationService,
    CategoryResolverService,
    ToolRegistry,

    // Tools
    GetBudgetsTool,
    GetCategoriesTool,
    GetGoalsTool,
    GetCashflowTool,
    GetRecommendationsTool,
    GetTransactionsTool,
    GetSubscriptionsTool,
    GetFxRateTool,
    RunScenarioTool,
    ExplainRecommendationTool,
    RecallMemoryTool,
    GetCashflowSummaryTool,
    LookupEducationTool,
    ExplainSpendingChangeTool,
    CalculateTool,
    CreateGoalTool,
    UpdateGoalTool,
    PauseGoalTool,
    ResumeGoalTool,
    AbandonGoalTool,
    CreateBudgetTool,
    AddBudgetLineTool,
    ArchiveBudgetTool,
    ContributeToGoalTool,
    AdjustBudgetLineTool,
    AcceptRecommendationTool,
    SnoozeRecommendationTool,

    // Agents
    AnalystAgent,
    PlannerAgent,
    ForecasterAgent,
    SupervisorAgent,
  ],
  exports: [MemoryModule, AiChatService, AgentSessionService, StagedActionsService],
})
export class AiModule {}
