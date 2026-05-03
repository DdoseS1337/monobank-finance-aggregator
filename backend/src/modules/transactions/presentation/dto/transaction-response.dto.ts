export class TransactionResponseDto {
  id: string;
  source: string;
  externalId: string;
  amount: string;
  operationAmount: string;
  currency: string;
  cashbackAmount: string;
  balance: string;
  descriptionRaw: string;
  merchantNameClean: string | null;
  mcc: number | null;
  mccCategory: string | null;
  transactionType: string;
  transactionTime: string;
  createdAt: string;
}
