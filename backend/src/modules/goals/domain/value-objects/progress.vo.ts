import Decimal from 'decimal.js';
import { Money } from '../../../../shared-kernel/money/money';

export class GoalProgress {
  constructor(
    public readonly current: Money,
    public readonly target: Money,
  ) {
    if (current.currency !== target.currency) {
      throw new Error('Currency mismatch in progress');
    }
  }

  pct(): number {
    if (this.target.isZero()) return 0;
    return Number(
      this.current.amount.div(this.target.amount).mul(100).toFixed(2),
    );
  }

  remaining(): Money {
    const diff = this.target.subtract(this.current);
    return diff.isNegative() ? Money.of(0, this.target.currency) : diff;
  }

  isReached(): boolean {
    return this.current.greaterThanOrEqual(this.target);
  }

  ratio(): Decimal {
    if (this.target.isZero()) return new Decimal(0);
    return this.current.amount.div(this.target.amount);
  }
}
