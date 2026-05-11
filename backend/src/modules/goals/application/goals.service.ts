import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Currency, Money } from '../../../shared-kernel/money/money';
import {
  ContributionSource,
  FundingStrategy,
  Goal,
  GoalType,
} from '../domain/goal.entity';
import {
  GOAL_REPOSITORY,
  GoalRepository,
} from '../domain/repositories.interface';

export interface CreateGoalInput {
  userId: string;
  type: GoalType;
  name: string;
  description?: string;
  targetAmount: string;
  baseCurrency: Currency;
  deadline?: Date;
  priority?: number;
  fundingStrategy?: FundingStrategy;
  fundingParams?: Record<string, unknown>;
  linkedAccountId?: string;
}

export interface ContributeInput {
  goalId: string;
  amount: string;
  sourceType?: ContributionSource;
  sourceRef?: string | null;
}

@Injectable()
export class GoalsService {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
  ) {}

  async createGoal(input: CreateGoalInput): Promise<Goal> {
    const goal = Goal.create({
      userId: input.userId,
      type: input.type,
      name: input.name,
      description: input.description,
      targetAmount: Money.of(input.targetAmount, input.baseCurrency),
      deadline: input.deadline,
      priority: input.priority,
      fundingStrategy: input.fundingStrategy,
      fundingParams: input.fundingParams,
      linkedAccountId: input.linkedAccountId,
    });
    await this.goals.save(goal);
    return goal;
  }

  async listGoals(userId: string, includeInactive = false): Promise<Goal[]> {
    if (includeInactive) {
      return this.goals.findByUser(userId);
    }
    return this.goals.findByUser(userId, { statuses: ['ACTIVE', 'PAUSED'] });
  }

  async getGoal(userId: string, goalId: string): Promise<Goal> {
    return this.requireGoal(userId, goalId);
  }

  async contribute(userId: string, input: ContributeInput): Promise<Goal> {
    const goal = await this.requireGoal(userId, input.goalId);
    goal.contribute({
      amount: Money.of(input.amount, goal.currency),
      sourceType: input.sourceType ?? 'MANUAL',
      sourceRef: input.sourceRef ?? null,
    });
    await this.goals.save(goal);
    return goal;
  }

  async adjustTarget(
    userId: string,
    goalId: string,
    newTarget: string,
  ): Promise<Goal> {
    const goal = await this.requireGoal(userId, goalId);
    goal.adjustTarget(Money.of(newTarget, goal.currency));
    await this.goals.save(goal);
    return goal;
  }

  async adjustDeadline(
    userId: string,
    goalId: string,
    newDeadline: Date | null,
  ): Promise<Goal> {
    const goal = await this.requireGoal(userId, goalId);
    goal.adjustDeadline(newDeadline);
    await this.goals.save(goal);
    return goal;
  }

  async adjustPriority(
    userId: string,
    goalId: string,
    priority: number,
  ): Promise<Goal> {
    const goal = await this.requireGoal(userId, goalId);
    goal.adjustPriority(priority);
    await this.goals.save(goal);
    return goal;
  }

  async pause(userId: string, goalId: string): Promise<Goal> {
    const goal = await this.requireGoal(userId, goalId);
    goal.pause();
    await this.goals.save(goal);
    return goal;
  }

  async resume(userId: string, goalId: string): Promise<Goal> {
    const goal = await this.requireGoal(userId, goalId);
    goal.resume();
    await this.goals.save(goal);
    return goal;
  }

  async abandon(userId: string, goalId: string, reason?: string): Promise<Goal> {
    const goal = await this.requireGoal(userId, goalId);
    goal.abandon(reason);
    await this.goals.save(goal);
    return goal;
  }

  async recalculateFeasibility(
    userId: string,
    goalId: string,
  ): Promise<{ goal: Goal; score: number }> {
    const goal = await this.requireGoal(userId, goalId);
    const score = goal.recalculateFeasibility();
    await this.goals.save(goal);
    return { goal, score: score.toNumber() };
  }

  /**
   * Cron-driven (worker) — recompute feasibility for every active goal
   * of every user that has at least one. Does NOT throw on per-goal
   * failures so a single bad goal doesn't kill the batch.
   */
  async recalculateFeasibilityForUser(userId: string): Promise<number> {
    const active = await this.goals.findActiveByUser(userId);
    let updated = 0;
    for (const goal of active) {
      try {
        goal.recalculateFeasibility();
        await this.goals.save(goal);
        updated++;
      } catch {
        // swallow; observability handled by caller
      }
    }
    return updated;
  }

  private async requireGoal(userId: string, goalId: string): Promise<Goal> {
    const goal = await this.goals.findById(goalId);
    if (!goal || goal.userId !== userId) {
      throw new NotFoundException(`Goal ${goalId} not found`);
    }
    return goal;
  }
}
