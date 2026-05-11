import { Period } from '../../../shared-kernel/period/period';
import { Money } from '../../../shared-kernel/money/money';
import { BudgetLine } from './budget-line.entity';

export type PeriodStatus = 'OPEN' | 'CLOSED' | 'ARCHIVED';

export interface BudgetPeriodProps {
  id: string;
  budgetId: string;
  period: Period;
  status: PeriodStatus;
  openingBalance: Money | null;
  closingBalance: Money | null;
  lines: BudgetLine[];
}

export class BudgetPeriod {
  private constructor(private props: BudgetPeriodProps) {}

  static rehydrate(props: BudgetPeriodProps): BudgetPeriod {
    return new BudgetPeriod(props);
  }

  static open(input: {
    id: string;
    budgetId: string;
    period: Period;
    openingBalance?: Money;
  }): BudgetPeriod {
    return new BudgetPeriod({
      id: input.id,
      budgetId: input.budgetId,
      period: input.period,
      status: 'OPEN',
      openingBalance: input.openingBalance ?? null,
      closingBalance: null,
      lines: [],
    });
  }

  get id(): string {
    return this.props.id;
  }
  get budgetId(): string {
    return this.props.budgetId;
  }
  get period(): Period {
    return this.props.period;
  }
  get status(): PeriodStatus {
    return this.props.status;
  }
  get lines(): BudgetLine[] {
    return [...this.props.lines];
  }
  get openingBalance(): Money | null {
    return this.props.openingBalance;
  }
  get closingBalance(): Money | null {
    return this.props.closingBalance;
  }

  isOpen(): boolean {
    return this.props.status === 'OPEN';
  }

  addLine(line: BudgetLine): void {
    if (!this.isOpen()) {
      throw new Error('Cannot add lines to a non-open period');
    }
    if (this.props.lines.some((l) => l.id === line.id)) {
      throw new Error('Duplicate line id');
    }
    if (
      line.categoryId !== null &&
      this.props.lines.some((l) => l.categoryId === line.categoryId)
    ) {
      throw new Error('Category already covered by another line in this period');
    }
    this.props.lines.push(line);
  }

  findLineByCategory(categoryId: string): BudgetLine | undefined {
    return this.props.lines.find((l) => l.categoryId === categoryId);
  }

  totalPlanned(): Money | null {
    if (this.props.lines.length === 0) return null;
    return this.props.lines.reduce(
      (acc, l) => acc.add(l.plannedAmount),
      Money.zero(this.props.lines[0]!.plannedAmount.currency),
    );
  }

  totalSpent(): Money | null {
    if (this.props.lines.length === 0) return null;
    return this.props.lines.reduce(
      (acc, l) => acc.add(l.spentAmount),
      Money.zero(this.props.lines[0]!.spentAmount.currency),
    );
  }

  elapsedRatio(at: Date = new Date()): number {
    return this.props.period.elapsedRatio(at);
  }

  close(closingBalance?: Money): void {
    if (!this.isOpen()) {
      throw new Error('Period already closed');
    }
    this.props.status = 'CLOSED';
    this.props.closingBalance = closingBalance ?? null;
  }

  toSnapshot(): BudgetPeriodProps {
    return { ...this.props, lines: [...this.props.lines] };
  }
}
