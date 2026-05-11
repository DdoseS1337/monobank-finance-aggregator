export type HealthStatus = 'GREEN' | 'YELLOW' | 'RED';

export class BudgetHealth {
  constructor(
    public readonly status: HealthStatus,
    public readonly atRiskLines: number,
    public readonly exceededLines: number,
    public readonly totalLines: number,
  ) {}

  static fromCounts(total: number, atRisk: number, exceeded: number): BudgetHealth {
    const status: HealthStatus =
      exceeded > 0 ? 'RED' : atRisk > 0 ? 'YELLOW' : 'GREEN';
    return new BudgetHealth(status, atRisk, exceeded, total);
  }
}
