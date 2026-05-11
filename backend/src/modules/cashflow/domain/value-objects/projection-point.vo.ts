import Decimal from 'decimal.js';

/**
 * Single point on the projected balance trajectory.
 * P10 / P50 / P90 are the 10th, 50th (median), and 90th percentiles
 * across Monte Carlo trajectories. Width (P90 − P10) is the model's
 * uncertainty for that day.
 */
export interface ProjectionPointProps {
  day: Date;
  balanceP10: Decimal;
  balanceP50: Decimal;
  balanceP90: Decimal;
  expectedInflow: Decimal;
  expectedOutflow: Decimal;
  hasDeficitRisk: boolean;
}

export class ProjectionPoint {
  constructor(private props: ProjectionPointProps) {}

  get day(): Date {
    return this.props.day;
  }
  get p10(): Decimal {
    return this.props.balanceP10;
  }
  get p50(): Decimal {
    return this.props.balanceP50;
  }
  get p90(): Decimal {
    return this.props.balanceP90;
  }
  get expectedInflow(): Decimal {
    return this.props.expectedInflow;
  }
  get expectedOutflow(): Decimal {
    return this.props.expectedOutflow;
  }
  get hasDeficitRisk(): boolean {
    return this.props.hasDeficitRisk;
  }

  uncertainty(): Decimal {
    return this.props.balanceP90.minus(this.props.balanceP10);
  }

  toSnapshot(): ProjectionPointProps {
    return { ...this.props };
  }
}
