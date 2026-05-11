import { Currency, Money } from '../../../shared-kernel/money/money';

export type TransactionType = 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'HOLD';
export type TransactionStatus = 'PENDING' | 'POSTED' | 'REVERSED';

export interface TransactionProps {
  id: string;
  userId: string;
  accountId: string;
  externalId: string | null;
  amount: Money;
  description: string | null;
  merchantName: string | null;
  mccCode: number | null;
  categoryId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  isRecurring: boolean;
  isAnomaly: boolean;
  anomalyScore: number | null;
  metadata: Record<string, unknown>;
  transactionDate: Date;
  importedAt: Date;
}

export class Transaction {
  private constructor(private props: TransactionProps) {}

  static rehydrate(props: TransactionProps): Transaction {
    return new Transaction(props);
  }

  static fromMonobank(input: {
    id: string;
    userId: string;
    accountId: string;
    externalId: string;
    amountMinor: number;
    currency: Currency;
    description: string | null;
    merchantName: string | null;
    mccCode: number | null;
    type: TransactionType;
    status?: TransactionStatus;
    transactionDate: Date;
    metadata?: Record<string, unknown>;
  }): Transaction {
    const moneyAmount = Math.abs(input.amountMinor) / 100;
    return new Transaction({
      id: input.id,
      userId: input.userId,
      accountId: input.accountId,
      externalId: input.externalId,
      amount: Money.of(moneyAmount, input.currency),
      description: input.description,
      merchantName: input.merchantName,
      mccCode: input.mccCode,
      categoryId: null,
      type: input.type,
      status: input.status ?? 'POSTED',
      isRecurring: false,
      isAnomaly: false,
      anomalyScore: null,
      metadata: input.metadata ?? {},
      transactionDate: input.transactionDate,
      importedAt: new Date(),
    });
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get accountId(): string {
    return this.props.accountId;
  }
  get externalId(): string | null {
    return this.props.externalId;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get description(): string | null {
    return this.props.description;
  }
  get merchantName(): string | null {
    return this.props.merchantName;
  }
  get mccCode(): number | null {
    return this.props.mccCode;
  }
  get categoryId(): string | null {
    return this.props.categoryId;
  }
  get type(): TransactionType {
    return this.props.type;
  }
  get status(): TransactionStatus {
    return this.props.status;
  }
  get transactionDate(): Date {
    return this.props.transactionDate;
  }

  // Commands
  recategorize(newCategoryId: string): { previousCategoryId: string | null } {
    const previous = this.props.categoryId;
    this.props.categoryId = newCategoryId;
    return { previousCategoryId: previous };
  }

  flagAsAnomaly(score: number): void {
    if (score < 0 || score > 1) throw new Error('Score must be in [0, 1]');
    this.props.isAnomaly = true;
    this.props.anomalyScore = score;
  }

  markAsRecurring(): void {
    this.props.isRecurring = true;
  }

  toSnapshot(): TransactionProps {
    return { ...this.props, metadata: { ...this.props.metadata } };
  }
}
