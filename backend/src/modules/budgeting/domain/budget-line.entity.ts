import { Money } from '../../../shared-kernel/money/money';
import { BurnRate } from './value-objects/burn-rate.vo';

export type BudgetLineStatus = 'OK' | 'WARNING' | 'EXCEEDED';

export interface BudgetLineProps {
  id: string;
  budgetPeriodId: string;
  categoryId: string | null;
  plannedAmount: Money;
  spentAmount: Money;
  thresholdPct: number;
  status: BudgetLineStatus;
}

export class BudgetLine {
  private constructor(private props: BudgetLineProps) {}

  static rehydrate(props: BudgetLineProps): BudgetLine {
    return new BudgetLine(props);
  }

  static create(input: Omit<BudgetLineProps, 'spentAmount' | 'status'> & { id: string }): BudgetLine {
    if (!input.plannedAmount.isPositive()) {
      throw new Error('Planned amount must be positive');
    }
    if (input.thresholdPct < 1 || input.thresholdPct > 100) {
      throw new Error('Threshold must be between 1 and 100');
    }
    return new BudgetLine({
      ...input,
      spentAmount: Money.zero(input.plannedAmount.currency),
      status: 'OK',
    });
  }

  get id(): string {
    return this.props.id;
  }
  get categoryId(): string | null {
    return this.props.categoryId;
  }
  get plannedAmount(): Money {
    return this.props.plannedAmount;
  }
  get spentAmount(): Money {
    return this.props.spentAmount;
  }
  get thresholdPct(): number {
    return this.props.thresholdPct;
  }
  get status(): BudgetLineStatus {
    return this.props.status;
  }

  setSpent(amount: Money): void {
    if (amount.currency !== this.props.plannedAmount.currency) {
      throw new Error('Currency mismatch');
    }
    this.props.spentAmount = amount;
    this.props.status = this.computeStatus();
  }

  adjustPlanned(newPlanned: Money): void {
    if (!newPlanned.isPositive()) {
      throw new Error('Planned amount must be positive');
    }
    if (newPlanned.currency !== this.props.plannedAmount.currency) {
      throw new Error('Cannot change currency on existing line');
    }
    this.props.plannedAmount = newPlanned;
    this.props.status = this.computeStatus();
  }

  burnRate(elapsedRatio: number): BurnRate {
    return BurnRate.compute(
      this.props.spentAmount.amount,
      this.props.plannedAmount.amount,
      elapsedRatio,
    );
  }

  spentPct(): number {
    if (this.props.plannedAmount.isZero()) return 0;
    return Number(
      this.props.spentAmount.amount
        .div(this.props.plannedAmount.amount)
        .mul(100)
        .toFixed(2),
    );
  }

  isAtRisk(): boolean {
    return this.props.status === 'WARNING';
  }

  isExceeded(): boolean {
    return this.props.status === 'EXCEEDED';
  }

  toSnapshot(): BudgetLineProps {
    return { ...this.props };
  }

  private computeStatus(): BudgetLineStatus {
    const pct = this.spentPct();
    if (pct >= 100) return 'EXCEEDED';
    if (pct >= this.props.thresholdPct) return 'WARNING';
    return 'OK';
  }
}
