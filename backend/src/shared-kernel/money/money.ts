import Decimal from 'decimal.js';

export type Currency = 'UAH' | 'USD' | 'EUR' | 'GBP' | 'PLN';

export class Money {
  private constructor(
    public readonly amount: Decimal,
    public readonly currency: Currency,
  ) {
    if (!amount.isFinite()) {
      throw new Error('Money amount must be finite');
    }
  }

  static of(amount: Decimal.Value, currency: Currency): Money {
    return new Money(new Decimal(amount), currency);
  }

  static zero(currency: Currency): Money {
    return new Money(new Decimal(0), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  multiply(factor: Decimal.Value): Money {
    return new Money(this.amount.mul(factor), this.currency);
  }

  divide(divisor: Decimal.Value): Money {
    return new Money(this.amount.div(divisor), this.currency);
  }

  percentage(pct: Decimal.Value): Money {
    return new Money(this.amount.mul(pct).div(100), this.currency);
  }

  isPositive(): boolean {
    return this.amount.isPositive() && !this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.greaterThan(other.amount);
  }

  greaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.greaterThanOrEqualTo(other.amount);
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.lessThan(other.amount);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  abs(): Money {
    return new Money(this.amount.abs(), this.currency);
  }

  negate(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  toFixed(decimals = 2): string {
    return this.amount.toFixed(decimals);
  }

  toJSON(): { amount: string; currency: Currency } {
    return { amount: this.amount.toFixed(2), currency: this.currency };
  }

  toString(): string {
    return `${this.amount.toFixed(2)} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Cannot operate on different currencies: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}
