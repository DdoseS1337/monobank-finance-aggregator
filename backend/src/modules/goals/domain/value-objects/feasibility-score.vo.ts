/**
 * FeasibilityScore — імовірність досягти цілі вчасно (0..1).
 *
 * Phase 2 — використовується deterministic estimate:
 *
 *   pace = avgMonthlyContribution
 *   monthsRequired = remaining / pace
 *   monthsAvailable = months between today and deadline
 *
 *   ratio = monthsAvailable / monthsRequired
 *   score = clamp(ratio, 0, 1)
 *
 * Phase 3 цей клас буде замінено на справжню Monte Carlo симуляцію,
 * що використовує CashflowForecasting (історія income/expense, активні
 * бюджети, інші цілі). Інтерфейс `compute()` лишається стабільним.
 */
export type FeasibilityCategory = 'AT_RISK' | 'TIGHT' | 'COMFORTABLE' | 'AHEAD';

export class FeasibilityScore {
  constructor(public readonly value: number) {
    if (value < 0 || value > 1 || Number.isNaN(value)) {
      throw new Error('Feasibility score must be in [0, 1]');
    }
  }

  static fromPace(input: {
    remaining: number;
    paceMonthly: number;
    monthsAvailable: number;
  }): FeasibilityScore {
    if (input.remaining <= 0) return new FeasibilityScore(1);
    if (input.monthsAvailable <= 0) return new FeasibilityScore(0);
    if (input.paceMonthly <= 0) return new FeasibilityScore(0);

    const monthsRequired = input.remaining / input.paceMonthly;
    const ratio = input.monthsAvailable / monthsRequired;
    return new FeasibilityScore(Math.max(0, Math.min(1, ratio)));
  }

  static unknown(): FeasibilityScore {
    // Default to "tight but possible" when there is no contribution history yet.
    return new FeasibilityScore(0.5);
  }

  category(): FeasibilityCategory {
    if (this.value < 0.4) return 'AT_RISK';
    if (this.value < 0.7) return 'TIGHT';
    if (this.value < 1) return 'COMFORTABLE';
    return 'AHEAD';
  }

  isAtRisk(): boolean {
    return this.value < 0.4;
  }

  toNumber(): number {
    return Number(this.value.toFixed(2));
  }
}
