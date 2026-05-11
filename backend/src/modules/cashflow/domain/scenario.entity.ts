import { randomUUID } from 'crypto';

export type ScenarioVariableKind =
  | { kind: 'INCOME_DELTA'; deltaMonthly: number; reason?: string }
  | { kind: 'CATEGORY_DELTA'; categorySlug: string; deltaPct: number }
  | { kind: 'NEW_GOAL'; targetAmount: number; deadline: string; monthlyContribution: number; name: string }
  | { kind: 'NEW_RECURRING'; amountMonthly: number; sign: 'INFLOW' | 'OUTFLOW'; description: string };

export interface ScenarioOutcome {
  metricKey: string;
  baseline: number;
  modified: number;
  delta: number;
  deltaPct: number;
}

export interface ScenarioProps {
  id: string;
  userId: string;
  name: string;
  baselineProjectionId: string | null;
  variables: ScenarioVariableKind[];
  outcomes: ScenarioOutcome[] | null;
  computedAt: Date | null;
  createdAt: Date;
}

export class Scenario {
  private constructor(private props: ScenarioProps) {}

  static rehydrate(props: ScenarioProps): Scenario {
    return new Scenario(props);
  }

  static create(input: {
    userId: string;
    name: string;
    baselineProjectionId: string | null;
    variables: ScenarioVariableKind[];
  }): Scenario {
    if (!input.name.trim()) throw new Error('Scenario name required');
    if (input.variables.length === 0) {
      throw new Error('Scenario needs at least one variable');
    }
    return new Scenario({
      id: randomUUID(),
      userId: input.userId,
      name: input.name.trim(),
      baselineProjectionId: input.baselineProjectionId,
      variables: input.variables,
      outcomes: null,
      computedAt: null,
      createdAt: new Date(),
    });
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get name(): string {
    return this.props.name;
  }
  get baselineProjectionId(): string | null {
    return this.props.baselineProjectionId;
  }
  get variables(): ScenarioVariableKind[] {
    return [...this.props.variables];
  }
  get outcomes(): ScenarioOutcome[] | null {
    return this.props.outcomes ? [...this.props.outcomes] : null;
  }
  get computedAt(): Date | null {
    return this.props.computedAt;
  }

  recordOutcomes(outcomes: ScenarioOutcome[]): void {
    this.props.outcomes = outcomes;
    this.props.computedAt = new Date();
  }

  toSnapshot(): ScenarioProps {
    return {
      ...this.props,
      variables: [...this.props.variables],
      outcomes: this.props.outcomes ? [...this.props.outcomes] : null,
    };
  }
}
