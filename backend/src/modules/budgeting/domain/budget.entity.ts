import { randomUUID } from 'crypto';
import { Currency, Money } from '../../../shared-kernel/money/money';
import { Period } from '../../../shared-kernel/period/period';
import { DomainEvent } from '../../../shared-kernel/events/domain-event';
import { BudgetPeriod } from './budget-period.entity';
import { BudgetLine } from './budget-line.entity';
import { BudgetHealth } from './value-objects/budget-health.vo';
import {
  BudgetCreated,
  BudgetPeriodClosed,
  BudgetPeriodStarted,
} from './events/budget-events';

export type BudgetMethod = 'CATEGORY' | 'ENVELOPE' | 'ZERO_BASED' | 'PAY_YOURSELF_FIRST';
export type Cadence = 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
export type RolloverPolicy = 'CARRY_OVER' | 'RESET' | 'PARTIAL';
export type BudgetStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface BudgetProps {
  id: string;
  userId: string;
  name: string;
  method: BudgetMethod;
  cadence: Cadence;
  baseCurrency: Currency;
  rolloverPolicy: RolloverPolicy;
  status: BudgetStatus;
  metadata: Record<string, unknown>;
  periods: BudgetPeriod[];
}

export class Budget {
  private events: DomainEvent[] = [];

  private constructor(private props: BudgetProps) {}

  static rehydrate(props: BudgetProps): Budget {
    return new Budget(props);
  }

  static create(input: {
    userId: string;
    name: string;
    method: BudgetMethod;
    cadence: Cadence;
    baseCurrency: Currency;
    rolloverPolicy?: RolloverPolicy;
  }): Budget {
    if (!input.name.trim()) {
      throw new Error('Budget name is required');
    }
    const budget = new Budget({
      id: randomUUID(),
      userId: input.userId,
      name: input.name.trim(),
      method: input.method,
      cadence: input.cadence,
      baseCurrency: input.baseCurrency,
      rolloverPolicy: input.rolloverPolicy ?? 'RESET',
      status: 'DRAFT',
      metadata: {},
      periods: [],
    });
    budget.events.push(
      new BudgetCreated(budget.id, {
        userId: input.userId,
        name: budget.props.name,
        method: input.method,
        cadence: input.cadence,
        baseCurrency: input.baseCurrency,
      }),
    );
    return budget;
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
  get method(): BudgetMethod {
    return this.props.method;
  }
  get cadence(): Cadence {
    return this.props.cadence;
  }
  get baseCurrency(): Currency {
    return this.props.baseCurrency;
  }
  get rolloverPolicy(): RolloverPolicy {
    return this.props.rolloverPolicy;
  }
  get status(): BudgetStatus {
    return this.props.status;
  }
  get periods(): BudgetPeriod[] {
    return [...this.props.periods];
  }

  currentPeriod(): BudgetPeriod | undefined {
    return this.props.periods.find((p) => p.isOpen());
  }

  activate(): void {
    if (this.props.status === 'ARCHIVED') {
      throw new Error('Cannot activate an archived budget');
    }
    this.props.status = 'ACTIVE';
  }

  archive(): void {
    if (this.props.status === 'ARCHIVED') return;
    const open = this.currentPeriod();
    if (open) {
      open.close();
      this.events.push(
        new BudgetPeriodClosed(this.id, {
          budgetId: this.id,
          periodId: open.id,
        }),
      );
    }
    this.props.status = 'ARCHIVED';
  }

  startPeriod(period: Period, openingBalance?: Money): BudgetPeriod {
    if (this.props.status === 'ARCHIVED') {
      throw new Error('Cannot start a period on an archived budget');
    }
    if (this.currentPeriod()) {
      throw new Error('Another period is already open');
    }
    if (openingBalance && openingBalance.currency !== this.props.baseCurrency) {
      throw new Error('Opening balance currency does not match budget currency');
    }
    const newPeriod = BudgetPeriod.open({
      id: randomUUID(),
      budgetId: this.id,
      period,
      openingBalance,
    });
    this.props.periods.push(newPeriod);
    if (this.props.status === 'DRAFT') this.props.status = 'ACTIVE';
    this.events.push(
      new BudgetPeriodStarted(this.id, {
        budgetId: this.id,
        periodId: newPeriod.id,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
      }),
    );
    return newPeriod;
  }

  closeCurrentPeriod(closingBalance?: Money): void {
    const current = this.currentPeriod();
    if (!current) {
      throw new Error('No open period to close');
    }
    current.close(closingBalance);
    this.events.push(
      new BudgetPeriodClosed(this.id, {
        budgetId: this.id,
        periodId: current.id,
        closingBalance: closingBalance?.toFixed(2),
      }),
    );
  }

  addLine(line: BudgetLine): void {
    const current = this.currentPeriod();
    if (!current) {
      throw new Error('No open period to add a line to');
    }
    if (line.plannedAmount.currency !== this.props.baseCurrency) {
      throw new Error('Line currency mismatch');
    }
    current.addLine(line);
  }

  evaluateHealth(): BudgetHealth {
    const current = this.currentPeriod();
    if (!current) return BudgetHealth.fromCounts(0, 0, 0);
    const lines = current.lines;
    const total = lines.length;
    const exceeded = lines.filter((l) => l.isExceeded()).length;
    const atRisk = lines.filter((l) => l.isAtRisk()).length;
    return BudgetHealth.fromCounts(total, atRisk, exceeded);
  }

  pullEvents(): DomainEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  toSnapshot(): BudgetProps {
    return { ...this.props, periods: [...this.props.periods] };
  }
}
