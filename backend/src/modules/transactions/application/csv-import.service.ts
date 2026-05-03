import { Injectable, BadRequestException } from '@nestjs/common';
import { TransactionIngestionService } from './transaction-ingestion.service';
import { parseCsvBuffer } from '../infrastructure/providers/csv/csv-parser.util';

@Injectable()
export class CsvImportService {
  constructor(private readonly ingestion: TransactionIngestionService) {}

  async importCsv(
    userId: string,
    accountId: string,
    fileBuffer: Buffer,
  ): Promise<{ synced: number }> {
    let transactions;
    try {
      transactions = parseCsvBuffer(fileBuffer, accountId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`CSV parse error: ${message}`);
    }

    if (transactions.length === 0) {
      return { synced: 0 };
    }

    return this.ingestion.ingestNormalized(userId, transactions, accountId);
  }
}
