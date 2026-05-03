import { parse } from 'csv-parse/sync';
import * as crypto from 'crypto';
import { NormalizedTransaction } from '../../../domain/normalized-transaction.entity';
import { TransactionType } from '../../../../../common/enums/transaction-type.enum';

interface CsvRow {
  date: string;
  amount: string;
  currency: string;
  description: string;
  mcc?: string;
  merchant?: string;
}

function detectType(amount: number): TransactionType {
  if (amount < 0) return TransactionType.DEBIT;
  return TransactionType.CREDIT;
}

function buildExternalId(accountId: string, row: CsvRow): string {
  const raw = `${row.date}|${row.amount}|${row.description}`;
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
  return `csv:${accountId}:${hash}`;
}

export function parseCsvBuffer(buffer: Buffer, accountId: string): NormalizedTransaction[] {
  const rows: CsvRow[] = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return rows.map((row) => {
    const amount = parseFloat(row.amount);
    const mcc = row.mcc ? parseInt(row.mcc, 10) : undefined;
    const transactionTime = new Date(row.date);

    const tx = new NormalizedTransaction();
    tx.source = 'csv';
    tx.externalId = buildExternalId(accountId, row);
    tx.amount = amount;
    tx.operationAmount = amount;
    tx.currency = (row.currency ?? 'UAH').toUpperCase();
    tx.cashbackAmount = 0;
    tx.commissionRate = 0;
    tx.balance = 0;
    tx.descriptionRaw = row.description ?? '';
    tx.merchantNameClean = row.merchant ? row.merchant.trim() : undefined;
    tx.mcc = isNaN(mcc!) ? undefined : mcc;
    tx.transactionType = detectType(amount);
    tx.transactionTime = transactionTime;
    tx.rawData = { ...row };

    return tx;
  });
}
