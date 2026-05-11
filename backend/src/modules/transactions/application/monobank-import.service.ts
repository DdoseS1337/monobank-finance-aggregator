import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { CredentialVault } from '../../../shared-kernel/credentials/credential-vault.service';
import { Currency } from '../../../shared-kernel/money/money';
import { MonobankClient, MonobankStatementItem } from '../infrastructure/monobank.client';
import { Transaction } from '../domain/transaction.entity';
import {
  TRANSACTION_REPOSITORY,
  TransactionRepository,
} from '../domain/repositories.interface';
import { CategorizationService } from '../../categorization/application/categorization.service';

const MONOBANK_PROVIDER = 'monobank';

export interface ImportResult {
  accountId: string;
  fetched: number;
  inserted: number;
  skipped: number;
  windowFrom: Date;
  windowTo: Date;
}

const MAX_WINDOW_DAYS = 31;
const DEFAULT_BACKFILL_DAYS = 31;

/**
 * Imports transactions from Monobank for a linked account.
 *
 * - Pulls the encrypted token from `CredentialVault` per request (one row
 *   per user, not per sub-account — see `provider_credentials`).
 * - Splits long windows into 31-day slices (Monobank API hard cap).
 * - Idempotent: relies on `accountId+externalId` unique constraint
 *   plus `existsByExternalId` short-circuit to avoid hitting the DB
 *   for already-known transactions.
 * - Single statement call per slice; the caller throttles to respect
 *   the Monobank 1 req/60s rate limit.
 */
@Injectable()
export class MonobankImportService {
  private readonly logger = new Logger(MonobankImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monobank: MonobankClient,
    private readonly vault: CredentialVault,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: TransactionRepository,
    private readonly categorization: CategorizationService,
  ) {}

  async importIncremental(
    userId: string,
    accountId: string,
    sinceDays = 1,
  ): Promise<ImportResult> {
    const account = await this.loadAccount(userId, accountId);
    const token = await this.vault.getToken(userId, MONOBANK_PROVIDER);

    const windowTo = new Date();
    const windowFrom = dayjs(windowTo).subtract(sinceDays, 'day').toDate();

    return this.runImport(
      userId,
      account.id,
      account.externalId,
      account.currency as Currency,
      token,
      windowFrom,
      windowTo,
    );
  }

  async importBackfill(
    userId: string,
    accountId: string,
    days = DEFAULT_BACKFILL_DAYS,
  ): Promise<ImportResult[]> {
    const account = await this.loadAccount(userId, accountId);
    const token = await this.vault.getToken(userId, MONOBANK_PROVIDER);

    const results: ImportResult[] = [];
    let windowTo = new Date();
    let remaining = days;
    while (remaining > 0) {
      const slice = Math.min(remaining, MAX_WINDOW_DAYS);
      const windowFrom = dayjs(windowTo).subtract(slice, 'day').toDate();
      const result = await this.runImport(
        userId,
        account.id,
        account.externalId,
        account.currency as Currency,
        token,
        windowFrom,
        windowTo,
      );
      results.push(result);
      windowTo = windowFrom;
      remaining -= slice;
    }
    return results;
  }

  private async runImport(
    userId: string,
    accountId: string,
    externalAccountId: string,
    accountCurrency: Currency,
    token: string,
    from: Date,
    to: Date,
  ): Promise<ImportResult> {
    const statement = await this.monobank.getStatement(token, externalAccountId, from, to);
    const transactions = statement.map((item) =>
      this.toTransaction(userId, accountId, accountCurrency, item),
    );
    const { inserted, skipped } = await this.transactions.saveBatch(transactions);
    await this.categorizeUncategorized(accountId, from, to);
    this.logger.log(
      `Imported ${inserted}/${statement.length} for account ${accountId} ` +
        `(${from.toISOString()} → ${to.toISOString()})`,
    );
    return {
      accountId,
      fetched: statement.length,
      inserted,
      skipped,
      windowFrom: from,
      windowTo: to,
    };
  }

  /**
   * Categorize transactions inline. The async saga in the worker process
   * does the same thing via outbox, but running inline guarantees a
   * categoryId is set even when the worker isn't running. Idempotent —
   * skips rows that already have a category.
   */
  private async categorizeUncategorized(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<void> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        accountId,
        categoryId: null,
        transactionDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        description: true,
        merchantName: true,
        mccCode: true,
      },
    });
    for (const row of rows) {
      const result = await this.categorization.categorize({
        description: row.description,
        merchantName: row.merchantName,
        mccCode: row.mccCode,
      });
      await this.prisma.transaction.update({
        where: { id: row.id },
        data: { categoryId: result.categoryId },
      });
    }
  }

  private toTransaction(
    userId: string,
    accountId: string,
    accountCurrency: Currency,
    item: MonobankStatementItem,
  ): Transaction {
    const operationCurrency = MonobankClient.currencyCodeToIso(
      item.currencyCode,
    ) as Currency;
    return Transaction.fromMonobank({
      id: randomUUID(),
      userId,
      accountId,
      externalId: item.id,
      amountMinor: item.amount,
      currency: accountCurrency,
      description: item.description,
      merchantName: item.counterName ?? null,
      mccCode: item.mcc,
      type: item.amount >= 0 ? 'CREDIT' : 'DEBIT',
      status: item.hold ? 'PENDING' : 'POSTED',
      transactionDate: new Date(item.time * 1000),
      metadata: {
        operationAmount: item.operationAmount,
        operationCurrency,
        commissionRate: item.commissionRate,
        cashbackAmount: item.cashbackAmount,
        balance: item.balance,
        comment: item.comment,
        hold: item.hold,
        receiptId: item.receiptId,
        invoiceId: item.invoiceId,
      },
    });
  }

  private async loadAccount(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: {
        id: true,
        externalId: true,
        currency: true,
      },
    });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    return account;
  }
}
