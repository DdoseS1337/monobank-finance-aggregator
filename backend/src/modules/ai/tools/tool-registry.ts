import { Injectable } from '@nestjs/common';
import { ToolDefinition } from './tool.interface';
import {
  GetBudgetsTool,
  GetCashflowTool,
  GetCategoriesTool,
  GetFxRateTool,
  GetGoalsTool,
  GetRecommendationsTool,
  GetSubscriptionsTool,
  GetTransactionsTool,
} from './read/read-tools';
import {
  CalculateTool,
  ExplainRecommendationTool,
  ExplainSpendingChangeTool,
  GetCashflowSummaryTool,
  LookupEducationTool,
  RecallMemoryTool,
  RunScenarioTool,
} from './cognitive/cognitive-tools';
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
  UpdateGoalTool,
} from './mutation/mutation-tools';

/**
 * Central registry. Each agent picks a subset of tools by name; the
 * supervisor resolves names to instances at runtime.
 */
@Injectable()
export class ToolRegistry {
  private readonly tools: Map<string, ToolDefinition<unknown, unknown>> = new Map();

  constructor(
    // Read
    getBudgets: GetBudgetsTool,
    getCategories: GetCategoriesTool,
    getGoals: GetGoalsTool,
    getCashflow: GetCashflowTool,
    getRecommendations: GetRecommendationsTool,
    getTransactions: GetTransactionsTool,
    getSubscriptions: GetSubscriptionsTool,
    getFxRate: GetFxRateTool,
    // Cognitive / memory
    runScenario: RunScenarioTool,
    explainRec: ExplainRecommendationTool,
    recallMemory: RecallMemoryTool,
    cashflowSummary: GetCashflowSummaryTool,
    lookupEducation: LookupEducationTool,
    explainSpendingChange: ExplainSpendingChangeTool,
    calculate: CalculateTool,
    // Mutation
    createGoal: CreateGoalTool,
    updateGoal: UpdateGoalTool,
    pauseGoal: PauseGoalTool,
    resumeGoal: ResumeGoalTool,
    abandonGoal: AbandonGoalTool,
    createBudget: CreateBudgetTool,
    addBudgetLine: AddBudgetLineTool,
    archiveBudget: ArchiveBudgetTool,
    contribute: ContributeToGoalTool,
    adjustLine: AdjustBudgetLineTool,
    acceptRec: AcceptRecommendationTool,
    snoozeRec: SnoozeRecommendationTool,
  ) {
    const all = [
      getBudgets,
      getCategories,
      getGoals,
      getCashflow,
      getRecommendations,
      getTransactions,
      getSubscriptions,
      getFxRate,
      runScenario,
      explainRec,
      recallMemory,
      cashflowSummary,
      lookupEducation,
      explainSpendingChange,
      calculate,
      createGoal,
      updateGoal,
      pauseGoal,
      resumeGoal,
      abandonGoal,
      createBudget,
      addBudgetLine,
      archiveBudget,
      contribute,
      adjustLine,
      acceptRec,
      snoozeRec,
    ] as ToolDefinition<unknown, unknown>[];
    all.forEach((t) => this.tools.set(t.name, t));
  }

  get(name: string): ToolDefinition<unknown, unknown> | undefined {
    return this.tools.get(name);
  }

  /** All registered tools — used by the supervisor for catalogue display. */
  all(): ToolDefinition<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  /** Returns the subset matching the given names (silently drops unknown). */
  subset(names: string[]): ToolDefinition<unknown, unknown>[] {
    return names
      .map((n) => this.tools.get(n))
      .filter((t): t is ToolDefinition<unknown, unknown> => t !== undefined);
  }
}
