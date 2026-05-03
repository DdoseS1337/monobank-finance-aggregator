import { TransactionType } from '../../../../../common/enums/transaction-type.enum';
import { currencyCodeToString } from '../../../../../common/utils/currency.util';
import { NormalizedTransaction } from '../../../domain/normalized-transaction.entity';
import { MonobankRawTransaction } from './monobank-raw-transaction.dto';

const KOPIYKAS_DIVISOR = 100;

function determineTransactionType(raw: MonobankRawTransaction): TransactionType {
  // Type is determined by amount sign. The `hold` flag (pending purchase)
  // is preserved in rawData for downstream use, but doesn't change the
  // primary type — a pending expense is still an expense for analytics.
  if (raw.amount > 0) return TransactionType.CREDIT;
  return TransactionType.DEBIT;
}

export function mapMonobankToNormalized(
  raw: MonobankRawTransaction,
): NormalizedTransaction {
  const tx = new NormalizedTransaction();

  tx.source = 'monobank';
  tx.externalId = raw.id;
  tx.amount = raw.amount / KOPIYKAS_DIVISOR;
  tx.operationAmount = raw.operationAmount / KOPIYKAS_DIVISOR;
  tx.currency = currencyCodeToString(raw.currencyCode);
  tx.cashbackAmount = raw.cashbackAmount / KOPIYKAS_DIVISOR;
  tx.commissionRate = raw.commissionRate / KOPIYKAS_DIVISOR;
  tx.balance = raw.balance / KOPIYKAS_DIVISOR;
  tx.descriptionRaw = raw.description;
  tx.merchantNameClean = raw.counterName ?? undefined;
  tx.mcc = raw.mcc;
  tx.transactionType = determineTransactionType(raw);
  tx.transactionTime = new Date(raw.time * 1000);
  tx.rawData = { ...raw };

  return tx;
}
