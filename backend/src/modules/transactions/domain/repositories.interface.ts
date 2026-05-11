import { Transaction } from './transaction.entity';

export const TRANSACTION_REPOSITORY = Symbol('TransactionRepository');

export interface TransactionFilter {
  userId: string;
  accountIds?: string[];
  categoryIds?: string[];
  from?: Date;
  to?: Date;
  type?: 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'HOLD';
  isAnomaly?: boolean;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface TransactionPage {
  items: Transaction[];
  nextCursor: string | null;
}

export interface TransactionRepository {
  saveBatch(transactions: Transaction[]): Promise<{ inserted: number; skipped: number }>;
  findById(id: string): Promise<Transaction | null>;
  list(filter: TransactionFilter): Promise<TransactionPage>;
  update(transaction: Transaction): Promise<void>;
  existsByExternalId(accountId: string, externalId: string): Promise<boolean>;
}
