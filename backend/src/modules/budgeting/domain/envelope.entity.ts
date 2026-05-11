import { randomUUID } from 'crypto';
import { Money, Currency } from '../../../shared-kernel/money/money';
import { DomainEvent } from '../../../shared-kernel/events/domain-event';
import { EnvelopeOverdrawn, EnvelopeRebalanced } from './events/budget-events';

export type MovementDirection = 'IN' | 'OUT' | 'TRANSFER';
export type FundingSource = 'TRANSACTION' | 'RULE' | 'MANUAL' | 'TRANSFER';

export interface EnvelopeMovement {
  id: string;
  amount: Money;
  direction: MovementDirection;
  sourceType: FundingSource;
  sourceRef: string | null;
  relatedEnvelopeId: string | null;
  occurredAt: Date;
}

export interface EnvelopeProps {
  id: string;
  userId: string;
  name: string;
  balance: Money;
  targetBalance: Money | null;
  color: string | null;
  sortOrder: number;
  archivedAt: Date | null;
}

export class Envelope {
  private events: DomainEvent[] = [];

  private constructor(private props: EnvelopeProps) {}

  static rehydrate(props: EnvelopeProps): Envelope {
    return new Envelope(props);
  }

  static create(input: {
    userId: string;
    name: string;
    currency: Currency;
    targetBalance?: Money;
    color?: string;
    sortOrder?: number;
  }): Envelope {
    if (!input.name.trim()) {
      throw new Error('Envelope name required');
    }
    return new Envelope({
      id: randomUUID(),
      userId: input.userId,
      name: input.name.trim(),
      balance: Money.zero(input.currency),
      targetBalance: input.targetBalance ?? null,
      color: input.color ?? null,
      sortOrder: input.sortOrder ?? 0,
      archivedAt: null,
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
  get balance(): Money {
    return this.props.balance;
  }
  get targetBalance(): Money | null {
    return this.props.targetBalance;
  }

  isArchived(): boolean {
    return this.props.archivedAt !== null;
  }

  isOverdrawn(): boolean {
    return this.props.balance.isNegative();
  }

  fund(amount: Money, source: FundingSource, sourceRef: string | null = null): EnvelopeMovement {
    this.assertSameCurrency(amount);
    if (!amount.isPositive()) {
      throw new Error('Funding amount must be positive');
    }
    this.props.balance = this.props.balance.add(amount);
    return this.createMovement(amount, 'IN', source, sourceRef);
  }

  spend(amount: Money, sourceRef: string): EnvelopeMovement {
    this.assertSameCurrency(amount);
    if (!amount.isPositive()) {
      throw new Error('Spend amount must be positive');
    }
    const newBalance = this.props.balance.subtract(amount);
    if (newBalance.isNegative()) {
      this.events.push(
        new EnvelopeOverdrawn(this.id, {
          envelopeId: this.id,
          attemptedAmount: amount.toFixed(2),
          currentBalance: this.props.balance.toFixed(2),
        }),
      );
    }
    this.props.balance = newBalance;
    return this.createMovement(amount, 'OUT', 'TRANSACTION', sourceRef);
  }

  transferTo(target: Envelope, amount: Money): { outgoing: EnvelopeMovement; incoming: EnvelopeMovement } {
    this.assertSameCurrency(amount);
    if (target.props.balance.currency !== this.props.balance.currency) {
      throw new Error('Cross-currency transfers are not supported');
    }
    if (!amount.isPositive()) {
      throw new Error('Transfer amount must be positive');
    }
    if (this.props.balance.lessThan(amount)) {
      throw new Error('Insufficient envelope balance');
    }
    this.props.balance = this.props.balance.subtract(amount);
    target.props.balance = target.props.balance.add(amount);

    const outgoing = this.createMovement(amount, 'TRANSFER', 'TRANSFER', null, target.id);
    const incoming: EnvelopeMovement = {
      id: randomUUID(),
      amount,
      direction: 'TRANSFER',
      sourceType: 'TRANSFER',
      sourceRef: null,
      relatedEnvelopeId: this.id,
      occurredAt: new Date(),
    };
    this.events.push(
      new EnvelopeRebalanced(this.id, {
        fromEnvelopeId: this.id,
        toEnvelopeId: target.id,
        amount: amount.toFixed(2),
        currency: amount.currency,
      }),
    );
    return { outgoing, incoming };
  }

  archive(): void {
    if (this.props.archivedAt) return;
    this.props.archivedAt = new Date();
  }

  pullEvents(): DomainEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  toSnapshot(): EnvelopeProps {
    return { ...this.props };
  }

  private createMovement(
    amount: Money,
    direction: MovementDirection,
    sourceType: FundingSource,
    sourceRef: string | null,
    relatedEnvelopeId: string | null = null,
  ): EnvelopeMovement {
    return {
      id: randomUUID(),
      amount,
      direction,
      sourceType,
      sourceRef,
      relatedEnvelopeId,
      occurredAt: new Date(),
    };
  }

  private assertSameCurrency(amount: Money): void {
    if (amount.currency !== this.props.balance.currency) {
      throw new Error(`Currency mismatch: ${amount.currency} vs ${this.props.balance.currency}`);
    }
  }
}
