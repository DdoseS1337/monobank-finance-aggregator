import { NormalizedTransaction } from '../../modules/transactions/domain/normalized-transaction.entity';

export interface BankAccount {
  id: string;
  currencyCode: number;
  balance: number;
  type: string;
}

export interface BankTransactionProvider {
  /** Unique source identifier, e.g. "monobank", "privatbank" */
  readonly source: string;

  /** Fetch transactions from the bank API, already mapped to normalized form */
  fetchTransactions(
    token: string,
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<NormalizedTransaction[]>;

  /** Fetch accounts/client info if supported by the provider */
  fetchAccounts(token: string): Promise<BankAccount[]>;
}
