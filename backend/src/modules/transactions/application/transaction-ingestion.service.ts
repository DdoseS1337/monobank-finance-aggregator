import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { BANK_PROVIDERS } from '../../../common/constants/injection-tokens';
import { BankTransactionProvider } from '../../../common/interfaces/bank-transaction-provider.interface';
import { MccLookupService } from '../../mcc/application/mcc-lookup.service';
import { MerchantRuleService } from '../../merchant-rules/application/merchant-rule.service';
import { NormalizedTransaction } from '../domain/normalized-transaction.entity';
import { RedisService } from '../../../redis/redis.service';
import {
  TransactionRepository,
  TransactionCreateInput,
} from '../infrastructure/repositories/transaction.repository';

const CACHE_PREFIXES = ['analytics', 'patterns', 'insights', 'forecast'];

@Injectable()
export class TransactionIngestionService {
  private readonly logger = new Logger(TransactionIngestionService.name);

  constructor(
    @Inject(BANK_PROVIDERS)
    private readonly providers: BankTransactionProvider[],
    private readonly mccLookup: MccLookupService,
    private readonly merchantRules: MerchantRuleService,
    private readonly transactionRepo: TransactionRepository,
    private readonly redis: RedisService,
  ) {}

  /** Invalidate all analytics/patterns/insights/forecast caches for a user. */
  private async invalidateUserCaches(userId: string): Promise<void> {
    const results = await Promise.all(
      CACHE_PREFIXES.map((prefix) =>
        this.redis.delPattern(`${prefix}:*:${userId}:*`),
      ),
    );
    const total = results.reduce((a, b) => a + b, 0);
    if (total > 0) {
      this.logger.log(`Invalidated ${total} cache entries for user=${userId}`);
    }
  }

  async getAccounts(source: string, token: string) {
    const provider = this.providers.find((p) => p.source === source);
    if (!provider) {
      throw new BadRequestException(`Unknown bank source: ${source}`);
    }
    return provider.fetchAccounts(token);
  }

  async syncTransactions(
    userId: string,
    source: string,
    token: string,
    accountId: string,
    from: Date,
    to: Date,
    internalAccountId?: string,
  ): Promise<{ synced: number }> {
    const provider = this.providers.find((p) => p.source === source);
    if (!provider) {
      throw new BadRequestException(`Unknown bank source: ${source}`);
    }

    this.logger.log(
      `Starting sync for user=${userId} source=${source} from=${from.toISOString()} to=${to.toISOString()}`,
    );

    const transactions = await provider.fetchTransactions(token, accountId, from, to);
    this.logger.log(`Fetched ${transactions.length} transactions, enriching...`);

    return this.ingestNormalized(userId, transactions, internalAccountId);
  }

  async ingestNormalized(
    userId: string,
    transactions: NormalizedTransaction[],
    internalAccountId?: string,
  ): Promise<{ synced: number }> {
    const enriched = await this.enrichCategories(transactions);

    const inputs: TransactionCreateInput[] = enriched.map((tx) => ({
      userId,
      accountId: internalAccountId,
      source: tx.source,
      externalId: tx.externalId,
      amount: tx.amount,
      operationAmount: tx.operationAmount,
      currency: tx.currency,
      cashbackAmount: tx.cashbackAmount,
      commissionRate: tx.commissionRate,
      balance: tx.balance,
      descriptionRaw: tx.descriptionRaw,
      merchantNameClean: tx.merchantNameClean,
      mcc: tx.mcc,
      mccCategory: tx.mccCategory,
      transactionType: tx.transactionType,
      transactionTime: tx.transactionTime,
      rawData: tx.rawData,
    }));

    const synced = await this.transactionRepo.upsertMany(inputs);
    this.logger.log(`Synced ${synced} transactions for user=${userId}`);

    if (synced > 0) {
      await this.invalidateUserCaches(userId);
    }

    return { synced };
  }

  async enrichCategories(
    transactions: NormalizedTransaction[],
  ): Promise<(NormalizedTransaction & { mccCategory?: string })[]> {
    return Promise.all(
      transactions.map(async (tx) => {
        // If category was explicitly set (e.g. manual entry) — keep it
        if (tx.mccCategory) {
          return { ...tx };
        }

        // 1. MCC lookup (highest priority)
        if (tx.mcc) {
          const info = await this.mccLookup.getCategoryForMcc(tx.mcc);
          if (info?.normalizedCategory) {
            return { ...tx, mccCategory: info.normalizedCategory };
          }
        }

        // 2. Merchant name / description rules (fallback)
        const ruleMatch = this.merchantRules.match(tx.merchantNameClean, tx.descriptionRaw);
        if (ruleMatch) {
          return { ...tx, mccCategory: ruleMatch.category };
        }

        return { ...tx, mccCategory: undefined };
      }),
    );
  }
}
