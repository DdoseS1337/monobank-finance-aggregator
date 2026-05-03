import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TransactionIngestionService } from './transaction-ingestion.service';
import { NormalizedTransaction } from '../domain/normalized-transaction.entity';
import { TransactionType } from '../../../common/enums/transaction-type.enum';
import { ManualTransactionDto } from '../presentation/dto/manual-transaction.dto';

@Injectable()
export class ManualTransactionService {
  constructor(private readonly ingestion: TransactionIngestionService) {}

  async create(
    userId: string,
    dto: ManualTransactionDto,
  ): Promise<{ synced: number }> {
    const tx = new NormalizedTransaction();
    tx.source = 'manual';
    tx.externalId = `manual:${randomUUID()}`;
    tx.amount = dto.amount;
    tx.operationAmount = dto.amount;
    tx.currency = dto.currency.toUpperCase();
    tx.cashbackAmount = 0;
    tx.commissionRate = 0;
    tx.balance = 0;
    tx.descriptionRaw = dto.description;
    tx.merchantNameClean = dto.merchantName ?? undefined;
    tx.mcc = dto.mcc ?? undefined;
    // Explicit category bypasses MCC + merchant rule enrichment
    tx.mccCategory = dto.category ?? undefined;
    tx.transactionType = dto.amount < 0 ? TransactionType.DEBIT : TransactionType.CREDIT;
    tx.transactionTime = new Date(dto.transactionTime);
    tx.rawData = {};

    return this.ingestion.ingestNormalized(userId, [tx], dto.accountId);
  }
}
