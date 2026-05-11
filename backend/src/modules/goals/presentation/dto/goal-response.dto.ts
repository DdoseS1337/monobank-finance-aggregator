import { Goal } from '../../domain/goal.entity';

export interface GoalResponse {
  id: string;
  type: string;
  name: string;
  description: string | null;
  targetAmount: string;
  currentAmount: string;
  baseCurrency: string;
  remaining: string;
  pct: number;
  deadline: string | null;
  priority: number;
  fundingStrategy: string;
  fundingParams: Record<string, unknown>;
  linkedAccountId: string | null;
  status: string;
  feasibility: {
    score: number | null;
    category: 'AT_RISK' | 'TIGHT' | 'COMFORTABLE' | 'AHEAD' | 'UNKNOWN';
    monthsAvailable: number | null;
    requiredMonthlyContribution: string | null;
    averageMonthlyContribution: number;
  };
  milestones: Array<{
    thresholdPct: number;
    reachedAt: string | null;
  }>;
  contributionsCount: number;
}

export class GoalMapper {
  static toResponse(goal: Goal): GoalResponse {
    const progress = goal.progress();
    const score = goal.feasibilityScore;
    const computed = goal.computeFeasibility();
    const required = goal.requiredMonthlyContribution();

    return {
      id: goal.id,
      type: goal.type,
      name: goal.name,
      description: null,
      targetAmount: goal.targetAmount.toFixed(2),
      currentAmount: goal.currentAmount.toFixed(2),
      baseCurrency: goal.currency,
      remaining: progress.remaining().toFixed(2),
      pct: progress.pct(),
      deadline: goal.deadline?.toISOString() ?? null,
      priority: goal.priority,
      fundingStrategy: goal.fundingStrategy,
      fundingParams: goal.fundingParams,
      linkedAccountId: goal.linkedAccountId,
      status: goal.status,
      feasibility: {
        score: score ?? computed.toNumber(),
        category:
          score === null && goal.contributions.length === 0
            ? 'UNKNOWN'
            : computed.category(),
        monthsAvailable: goal.monthsUntilDeadline(),
        requiredMonthlyContribution: required?.toFixed(2) ?? null,
        averageMonthlyContribution: Number(
          goal.averageMonthlyContribution().toFixed(2),
        ),
      },
      milestones: goal.milestones.map((m) => ({
        thresholdPct: m.thresholdPct,
        reachedAt: m.reachedAt?.toISOString() ?? null,
      })),
      contributionsCount: goal.contributions.length,
    };
  }
}
