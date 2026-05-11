import Decimal from 'decimal.js';

/**
 * Ratio of budget consumed against time elapsed within a period.
 *   ratio = (spent / planned) / elapsedRatio
 *
 *   ratio < 1   → on track or under-spending
 *   ratio = 1   → spending matches the rate of time
 *   ratio > 1   → spending faster than time allows
 *
 * `elapsedRatio` of 0 (period just opened) is treated as a tiny ε to
 * avoid division by zero; in that case any spend produces a very high rate.
 */
export class BurnRate {
  private static readonly EPSILON = new Decimal(0.0001);

  private constructor(public readonly ratio: Decimal) {}

  static compute(spent: Decimal, planned: Decimal, elapsedRatio: number): BurnRate {
    if (planned.isZero()) {
      return new BurnRate(spent.isZero() ? new Decimal(0) : new Decimal(Infinity));
    }
    const denom = elapsedRatio <= 0 ? this.EPSILON : new Decimal(elapsedRatio);
    const ratio = spent.div(planned).div(denom);
    return new BurnRate(ratio);
  }

  isOverpace(): boolean {
    return this.ratio.greaterThan(1);
  }

  toNumber(): number {
    return this.ratio.toNumber();
  }
}
