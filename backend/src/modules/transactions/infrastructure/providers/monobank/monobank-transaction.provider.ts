import { Injectable, Logger } from '@nestjs/common';
import {
  BankAccount,
  BankTransactionProvider,
} from '../../../../../common/interfaces/bank-transaction-provider.interface';
import { NormalizedTransaction } from '../../../domain/normalized-transaction.entity';
import { MonobankClientService } from './monobank-client.service';
import { mapMonobankToNormalized } from './monobank-mapper.util';

const MAX_RANGE_SECONDS = 2_682_000; // 31 days + 1 hour

@Injectable()
export class MonobankTransactionProvider implements BankTransactionProvider {
  readonly source = 'monobank';
  private readonly logger = new Logger(MonobankTransactionProvider.name);

  constructor(private readonly client: MonobankClientService) {}

  async fetchTransactions(
    token: string,
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<NormalizedTransaction[]> {
    const chunks = this.splitDateRange(from, to);
    const allTransactions: NormalizedTransaction[] = [];

    for (const chunk of chunks) {
      this.logger.log(
        `Fetching Monobank statements: ${new Date(chunk.from * 1000).toISOString()} → ${new Date(chunk.to * 1000).toISOString()}`,
      );

      const raw = await this.client.getStatements(
        token,
        accountId,
        chunk.from,
        chunk.to,
      );

      const normalized = raw.map(mapMonobankToNormalized);
      allTransactions.push(...normalized);

      this.logger.log(`Fetched ${raw.length} transactions in this chunk`);
    }

    return allTransactions;
  }

  async fetchAccounts(token: string): Promise<BankAccount[]> {
    const info = await this.client.getClientInfo(token);

    return info.accounts.map((a) => ({
      id: a.id,
      currencyCode: a.currencyCode,
      balance: a.balance / 100,
      type: a.type,
    }));
  }

  private splitDateRange(
    from: Date,
    to: Date,
  ): { from: number; to: number }[] {
    const fromUnix = Math.floor(from.getTime() / 1000);
    const toUnix = Math.floor(to.getTime() / 1000);
    const chunks: { from: number; to: number }[] = [];

    let chunkStart = fromUnix;
    while (chunkStart < toUnix) {
      const chunkEnd = Math.min(chunkStart + MAX_RANGE_SECONDS, toUnix);
      chunks.push({ from: chunkStart, to: chunkEnd });
      chunkStart = chunkEnd;
    }

    return chunks;
  }
}
