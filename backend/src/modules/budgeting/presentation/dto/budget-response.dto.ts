import { Budget } from '../../domain/budget.entity';
import { BudgetHealth } from '../../domain/value-objects/budget-health.vo';

export interface BudgetLineResponse {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  plannedAmount: string;
  spentAmount: string;
  spentPct: number;
  thresholdPct: number;
  status: 'OK' | 'WARNING' | 'EXCEEDED';
}

export interface BudgetPeriodResponse {
  id: string;
  start: string;
  end: string;
  status: string;
  totalPlanned: string | null;
  totalSpent: string | null;
  lines: BudgetLineResponse[];
}

export interface BudgetResponse {
  id: string;
  name: string;
  method: string;
  cadence: string;
  baseCurrency: string;
  rolloverPolicy: string;
  status: string;
  currentPeriod: BudgetPeriodResponse | null;
  health: {
    status: 'GREEN' | 'YELLOW' | 'RED';
    atRiskLines: number;
    exceededLines: number;
    totalLines: number;
  };
}

export class BudgetMapper {
  static toResponse(
    budget: Budget,
    health?: BudgetHealth,
    categoryNames?: Map<string, string>,
  ): BudgetResponse {
    const period = budget.currentPeriod();
    const computedHealth = health ?? budget.evaluateHealth();
    return {
      id: budget.id,
      name: budget.name,
      method: budget.method,
      cadence: budget.cadence,
      baseCurrency: budget.baseCurrency,
      rolloverPolicy: budget.rolloverPolicy,
      status: budget.status,
      currentPeriod: period
        ? {
            id: period.id,
            start: period.period.start.toISOString(),
            end: period.period.end.toISOString(),
            status: period.status,
            totalPlanned: period.totalPlanned()?.toFixed(2) ?? null,
            totalSpent: period.totalSpent()?.toFixed(2) ?? null,
            lines: period.lines.map((l) => ({
              id: l.id,
              categoryId: l.categoryId,
              categoryName: l.categoryId
                ? categoryNames?.get(l.categoryId) ?? null
                : null,
              plannedAmount: l.plannedAmount.toFixed(2),
              spentAmount: l.spentAmount.toFixed(2),
              spentPct: l.spentPct(),
              thresholdPct: l.thresholdPct,
              status: l.status,
            })),
          }
        : null,
      health: {
        status: computedHealth.status,
        atRiskLines: computedHealth.atRiskLines,
        exceededLines: computedHealth.exceededLines,
        totalLines: computedHealth.totalLines,
      },
    };
  }
}
