import { TransactionType } from '../../../common/enums/transaction-type.enum';

export class NormalizedTransaction {
  source: string;
  externalId: string;
  amount: number;
  operationAmount: number;
  currency: string;
  cashbackAmount: number;
  commissionRate: number;
  balance: number;
  descriptionRaw: string;
  merchantNameClean?: string;
  mcc?: number;
  mccCategory?: string;
  transactionType: TransactionType;
  transactionTime: Date;
  rawData: Record<string, unknown>;
}
