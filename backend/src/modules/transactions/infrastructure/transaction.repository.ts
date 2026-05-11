import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { Currency, Money } from '../../../shared-kernel/money/money';
import { Transaction, TransactionStatus, TransactionType } from '../domain/transaction.entity';
import {
  TransactionFilter,
  TransactionPage,
  TransactionRepository,
} from '../domain/repositories.interface';
import { TransactionImported } from '../domain/events/transaction-events';

@Injectable()
export class PrismaTransactionRepository implements TransactionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
  ) {}

  async saveBatch(
    transactions: Transaction[],
  ): Promise<{ inserted: number; skipped: number }> {
    if (transactions.length === 0) return { inserted: 0, skipped: 0 };

    let inserted = 0;
    let skipped = 0;

    // We persist + emit events inside one transaction per row to keep the
    // outbox guarantee. createMany would be faster but skips the events.
    for (const t of transactions) {
      const s = t.toSnapshot();
      const persisted = await this.prisma.$transaction(async (tx) => {
        const existing =
          s.externalId !== null
            ? await tx.transaction.findUnique({
                where: {
                  accountId_externalId: {
                    accountId: s.accountId,
                    externalId: s.externalId,
                  },
                },
                select: { id: true },
              })
            : null;
        if (existing) return false;

        await tx.transaction.create({
          data: {
            id: s.id,
            userId: s.userId,
            accountId: s.accountId,
            externalId: s.externalId,
            amount: s.amount.amount,
            currency: s.amount.currency,
            description: s.description,
            merchantName: s.merchantName,
            mccCode: s.mccCode,
            categoryId: s.categoryId,
            type: s.type,
            status: s.status,
            isRecurring: s.isRecurring,
            isAnomaly: s.isAnomaly,
            anomalyScore: s.anomalyScore,
            metadata: s.metadata as Prisma.InputJsonValue,
            transactionDate: s.transactionDate,
            importedAt: s.importedAt,
          },
        });

        await this.events.publish(
          new TransactionImported(
            s.id,
            {
              transactionId: s.id,
              userId: s.userId,
              accountId: s.accountId,
              amount: s.amount.toFixed(2),
              currency: s.amount.currency,
              type: s.type,
              mccCode: s.mccCode,
              merchantName: s.merchantName,
              description: s.description,
            },
            { userId: s.userId },
          ),
          tx,
        );
        return true;
      });
      persisted ? inserted++ : skipped++;
    }
    return { inserted, skipped };
  }

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findUnique({ where: { id } });
    return row ? this.toAggregate(row) : null;
  }

  async list(filter: TransactionFilter): Promise<TransactionPage> {
    const limit = Math.min(filter.limit ?? 50, 200);
    const where: Prisma.TransactionWhereInput = { userId: filter.userId };
    if (filter.accountIds?.length) where.accountId = { in: filter.accountIds };
    if (filter.categoryIds?.length) where.categoryId = { in: filter.categoryIds };
    if (filter.type) where.type = filter.type;
    if (filter.isAnomaly !== undefined) where.isAnomaly = filter.isAnomaly;
    if (filter.from || filter.to) {
      where.transactionDate = {};
      if (filter.from) where.transactionDate.gte = filter.from;
      if (filter.to) where.transactionDate.lte = filter.to;
    }
    if (filter.search) {
      where.OR = [
        { description: { contains: filter.search, mode: 'insensitive' } },
        { merchantName: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    // Cursor = base64(transactionDate.toISOString() + '::' + id)
    if (filter.cursor) {
      try {
        const decoded = Buffer.from(filter.cursor, 'base64').toString();
        const [iso, id] = decoded.split('::');
        if (iso && id) {
          where.OR = [
            ...(where.OR ?? []),
            { transactionDate: { lt: new Date(iso) } },
            { transactionDate: new Date(iso), id: { lt: id } },
          ];
        }
      } catch {
        /* ignore malformed cursor */
      }
    }

    const rows = await this.prisma.transaction.findMany({
      where,
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? Buffer.from(`${last.transactionDate.toISOString()}::${last.id}`).toString('base64')
        : null;

    return {
      items: items.map((r) => this.toAggregate(r)),
      nextCursor,
    };
  }

  async update(transaction: Transaction): Promise<void> {
    const s = transaction.toSnapshot();
    await this.prisma.transaction.update({
      where: { id: s.id },
      data: {
        categoryId: s.categoryId,
        isRecurring: s.isRecurring,
        isAnomaly: s.isAnomaly,
        anomalyScore: s.anomalyScore,
        metadata: s.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async existsByExternalId(accountId: string, externalId: string): Promise<boolean> {
    const row = await this.prisma.transaction.findUnique({
      where: { accountId_externalId: { accountId, externalId } },
      select: { id: true },
    });
    return row !== null;
  }

  private toAggregate(row: {
    id: string;
    userId: string;
    accountId: string;
    externalId: string | null;
    amount: Prisma.Decimal;
    currency: string;
    description: string | null;
    merchantName: string | null;
    mccCode: number | null;
    categoryId: string | null;
    type: string;
    status: string;
    isRecurring: boolean;
    isAnomaly: boolean;
    anomalyScore: Prisma.Decimal | null;
    metadata: Prisma.JsonValue;
    transactionDate: Date;
    importedAt: Date;
  }): Transaction {
    const currency = row.currency as Currency;
    return Transaction.rehydrate({
      id: row.id,
      userId: row.userId,
      accountId: row.accountId,
      externalId: row.externalId,
      amount: Money.of(row.amount as unknown as Decimal, currency),
      description: row.description,
      merchantName: row.merchantName,
      mccCode: row.mccCode,
      categoryId: row.categoryId,
      type: row.type as TransactionType,
      status: row.status as TransactionStatus,
      isRecurring: row.isRecurring,
      isAnomaly: row.isAnomaly,
      anomalyScore:
        row.anomalyScore !== null ? Number(row.anomalyScore) : null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      transactionDate: row.transactionDate,
      importedAt: row.importedAt,
    });
  }
}
