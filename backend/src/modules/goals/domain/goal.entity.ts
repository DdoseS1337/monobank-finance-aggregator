import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import { Currency, Money } from '../../../shared-kernel/money/money';
import { DomainEvent } from '../../../shared-kernel/events/domain-event';
import { GoalProgress } from './value-objects/progress.vo';
import { FeasibilityScore } from './value-objects/feasibility-score.vo';
import {
  GoalAbandoned,
  GoalAtRisk,
  GoalCompleted,
  GoalContributionMade,
  GoalCreated,
  GoalDeadlineMissed,
  GoalMilestoneReached,
} from './events/goal-events';

export type GoalType = 'SAVING' | 'DEBT_PAYOFF' | 'INVESTMENT' | 'PURCHASE';
export type FundingStrategy = 'FIXED_MONTHLY' | 'PERCENTAGE_INCOME' | 'SURPLUS';
export type GoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';
export type ContributionSource = 'MANUAL' | 'RULE' | 'TRANSACTION_LINK' | 'SURPLUS_AUTO';

export interface GoalContributionRecord {
  id: string;
  amount: Money;
  sourceType: ContributionSource;
  sourceRef: string | null;
  madeAt: Date;
}

export interface GoalMilestone {
  thresholdPct: number;
  reachedAt: Date | null;
  rewardText: string | null;
}

export interface GoalProps {
  id: string;
  userId: string;
  type: GoalType;
  name: string;
  description: string | null;
  targetAmount: Money;
  currentAmount: Money;
  deadline: Date | null;
  priority: number;
  fundingStrategy: FundingStrategy;
  fundingParams: Record<string, unknown>;
  linkedAccountId: string | null;
  status: GoalStatus;
  feasibilityScore: number | null;
  lastFeasibilityCalcAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  contributions: GoalContributionRecord[];
  milestones: GoalMilestone[];
}

const DEFAULT_MILESTONES = [25, 50, 75, 100];

export class Goal {
  private events: DomainEvent[] = [];

  private constructor(private props: GoalProps) {}

  static rehydrate(props: GoalProps): Goal {
    return new Goal(props);
  }

  static create(input: {
    userId: string;
    type: GoalType;
    name: string;
    targetAmount: Money;
    deadline?: Date;
    priority?: number;
    description?: string;
    fundingStrategy?: FundingStrategy;
    fundingParams?: Record<string, unknown>;
    linkedAccountId?: string;
  }): Goal {
    if (!input.name.trim()) throw new Error('Goal name required');
    if (!input.targetAmount.isPositive()) {
      throw new Error('Target amount must be positive');
    }
    if (input.priority !== undefined && (input.priority < 1 || input.priority > 5)) {
      throw new Error('Priority must be between 1 and 5');
    }
    const now = new Date();
    const goal = new Goal({
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      name: input.name.trim(),
      description: input.description ?? null,
      targetAmount: input.targetAmount,
      currentAmount: Money.zero(input.targetAmount.currency),
      deadline: input.deadline ?? null,
      priority: input.priority ?? 3,
      fundingStrategy: input.fundingStrategy ?? 'FIXED_MONTHLY',
      fundingParams: input.fundingParams ?? {},
      linkedAccountId: input.linkedAccountId ?? null,
      status: 'ACTIVE',
      feasibilityScore: null,
      lastFeasibilityCalcAt: null,
      createdAt: now,
      completedAt: null,
      contributions: [],
      milestones: DEFAULT_MILESTONES.map((p) => ({
        thresholdPct: p,
        reachedAt: null,
        rewardText: null,
      })),
    });
    goal.events.push(
      new GoalCreated(goal.id, {
        userId: input.userId,
        type: input.type,
        name: goal.props.name,
        targetAmount: input.targetAmount.toFixed(2),
        baseCurrency: input.targetAmount.currency,
        deadline: input.deadline?.toISOString() ?? null,
      }),
    );
    return goal;
  }

  // ---------- Getters ----------
  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get name(): string {
    return this.props.name;
  }
  get type(): GoalType {
    return this.props.type;
  }
  get status(): GoalStatus {
    return this.props.status;
  }
  get currency(): Currency {
    return this.props.targetAmount.currency;
  }
  get targetAmount(): Money {
    return this.props.targetAmount;
  }
  get currentAmount(): Money {
    return this.props.currentAmount;
  }
  get deadline(): Date | null {
    return this.props.deadline;
  }
  get priority(): number {
    return this.props.priority;
  }
  get fundingStrategy(): FundingStrategy {
    return this.props.fundingStrategy;
  }
  get fundingParams(): Record<string, unknown> {
    return { ...this.props.fundingParams };
  }
  get linkedAccountId(): string | null {
    return this.props.linkedAccountId;
  }
  get contributions(): GoalContributionRecord[] {
    return [...this.props.contributions];
  }
  get milestones(): GoalMilestone[] {
    return this.props.milestones.map((m) => ({ ...m }));
  }
  get feasibilityScore(): number | null {
    return this.props.feasibilityScore;
  }

  // ---------- Queries ----------
  progress(): GoalProgress {
    return new GoalProgress(this.props.currentAmount, this.props.targetAmount);
  }

  averageMonthlyContribution(): number {
    const ctrs = this.props.contributions;
    if (ctrs.length === 0) return 0;
    const earliest = ctrs.reduce(
      (min, c) => (c.madeAt < min ? c.madeAt : min),
      ctrs[0]!.madeAt,
    );
    const months = Math.max(
      1,
      dayjs().diff(dayjs(earliest), 'month', true),
    );
    const total = ctrs.reduce(
      (acc, c) => acc + c.amount.amount.toNumber(),
      0,
    );
    return total / months;
  }

  monthsUntilDeadline(at: Date = new Date()): number | null {
    if (!this.props.deadline) return null;
    return Math.max(0, dayjs(this.props.deadline).diff(at, 'month', true));
  }

  requiredMonthlyContribution(at: Date = new Date()): Money | null {
    const months = this.monthsUntilDeadline(at);
    if (months === null) return null;
    if (months <= 0) return this.progress().remaining();
    const remaining = this.progress().remaining();
    return remaining.divide(months);
  }

  computeFeasibility(): FeasibilityScore {
    if (this.progress().isReached()) return new FeasibilityScore(1);
    const monthsAvailable = this.monthsUntilDeadline();
    if (monthsAvailable === null) return FeasibilityScore.unknown();
    const pace = this.averageMonthlyContribution();
    if (pace === 0) return FeasibilityScore.unknown();
    return FeasibilityScore.fromPace({
      remaining: this.progress().remaining().amount.toNumber(),
      paceMonthly: pace,
      monthsAvailable,
    });
  }

  // ---------- Commands ----------
  contribute(input: {
    amount: Money;
    sourceType: ContributionSource;
    sourceRef?: string | null;
    madeAt?: Date;
  }): GoalContributionRecord {
    if (this.props.status !== 'ACTIVE') {
      throw new Error(`Cannot contribute to ${this.props.status.toLowerCase()} goal`);
    }
    if (!input.amount.isPositive()) {
      throw new Error('Contribution must be positive');
    }
    if (input.amount.currency !== this.currency) {
      throw new Error('Currency mismatch on contribution');
    }

    const record: GoalContributionRecord = {
      id: randomUUID(),
      amount: input.amount,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef ?? null,
      madeAt: input.madeAt ?? new Date(),
    };
    this.props.contributions.push(record);
    this.props.currentAmount = this.props.currentAmount.add(input.amount);

    this.events.push(
      new GoalContributionMade(this.id, {
        goalId: this.id,
        amount: input.amount.toFixed(2),
        sourceType: input.sourceType,
        sourceRef: record.sourceRef,
        newCurrentAmount: this.props.currentAmount.toFixed(2),
      }),
    );

    this.checkMilestones();
    this.maybeComplete();
    return record;
  }

  adjustTarget(newTarget: Money): void {
    if (newTarget.currency !== this.currency) {
      throw new Error('Currency cannot change');
    }
    if (!newTarget.isPositive()) {
      throw new Error('Target must be positive');
    }
    this.props.targetAmount = newTarget;
    this.maybeComplete();
  }

  adjustDeadline(newDeadline: Date | null): void {
    this.props.deadline = newDeadline;
  }

  adjustPriority(priority: number): void {
    if (priority < 1 || priority > 5) {
      throw new Error('Priority must be between 1 and 5');
    }
    this.props.priority = priority;
  }

  pause(): void {
    if (this.props.status !== 'ACTIVE') return;
    this.props.status = 'PAUSED';
  }

  resume(): void {
    if (this.props.status !== 'PAUSED') return;
    this.props.status = 'ACTIVE';
  }

  abandon(reason?: string): void {
    if (this.props.status === 'COMPLETED' || this.props.status === 'ABANDONED') return;
    this.props.status = 'ABANDONED';
    this.events.push(
      new GoalAbandoned(this.id, {
        goalId: this.id,
        reason: reason ?? null,
        abandonedAt: new Date().toISOString(),
      }),
    );
  }

  recalculateFeasibility(): FeasibilityScore {
    const score = this.computeFeasibility();
    this.props.feasibilityScore = score.toNumber();
    this.props.lastFeasibilityCalcAt = new Date();
    if (score.isAtRisk() && this.props.status === 'ACTIVE') {
      const monthsAvailable = this.monthsUntilDeadline() ?? 0;
      const pace = this.averageMonthlyContribution();
      const monthsRequired =
        pace > 0
          ? this.progress().remaining().amount.toNumber() / pace
          : null;
      this.events.push(
        new GoalAtRisk(this.id, {
          goalId: this.id,
          feasibilityScore: score.toNumber(),
          monthsAvailable,
          monthsRequired,
        }),
      );
    }
    return score;
  }

  /**
   * Called by a scheduled cron from the worker pool to flag missed deadlines.
   */
  checkDeadlinePassed(at: Date = new Date()): void {
    if (this.props.status !== 'ACTIVE') return;
    if (!this.props.deadline) return;
    if (at < this.props.deadline) return;
    if (this.progress().isReached()) return;
    this.events.push(
      new GoalDeadlineMissed(this.id, {
        goalId: this.id,
        deadline: this.props.deadline.toISOString(),
        shortfallAmount: this.progress().remaining().toFixed(2),
      }),
    );
  }

  pullEvents(): DomainEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  toSnapshot(): GoalProps {
    return {
      ...this.props,
      contributions: [...this.props.contributions],
      milestones: this.props.milestones.map((m) => ({ ...m })),
      fundingParams: { ...this.props.fundingParams },
    };
  }

  // ---------- Internal ----------
  private checkMilestones(): void {
    const pct = this.progress().pct();
    for (const milestone of this.props.milestones) {
      if (milestone.reachedAt) continue;
      if (pct >= milestone.thresholdPct) {
        milestone.reachedAt = new Date();
        this.events.push(
          new GoalMilestoneReached(this.id, {
            goalId: this.id,
            thresholdPct: milestone.thresholdPct,
            reachedAt: milestone.reachedAt.toISOString(),
          }),
        );
      }
    }
  }

  private maybeComplete(): void {
    if (this.props.status === 'COMPLETED') return;
    if (!this.progress().isReached()) return;
    this.props.status = 'COMPLETED';
    this.props.completedAt = new Date();
    this.events.push(
      new GoalCompleted(this.id, {
        goalId: this.id,
        finalAmount: this.props.currentAmount.toFixed(2),
        completedAt: this.props.completedAt.toISOString(),
      }),
    );
  }
}
