import { Injectable } from '@nestjs/common';
import { Prisma, Transaction, TransactionType } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface TransactionCreateInput {
  userId: string;
  accountId?: string;
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
  transactionType: string;
  transactionTime: Date;
  rawData: Record<string, unknown>;
}

export interface TransactionFilters {
  from?: Date;
  to?: Date;
  mccCategory?: string;
  /** 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'HOLD' */
  transactionType?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class TransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertMany(transactions: TransactionCreateInput[]): Promise<number> {
    // No outer $transaction — each upsert is atomic via the unique
    // constraint (source, externalId), and sync is naturally resumable
    // (re-running picks up anything that failed). Wrapping hundreds of
    // upserts in one interactive transaction hits Prisma's 5s timeout.
    const BATCH_SIZE = 25;
    let count = 0;

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((t) =>
          this.prisma.transaction.upsert({
            where: {
              uq_source_external_id: {
                source: t.source,
                externalId: t.externalId,
              },
            },
            create: {
              userId: t.userId,
              accountId: t.accountId ?? null,
              source: t.source,
              externalId: t.externalId,
              amount: new Prisma.Decimal(t.amount),
              operationAmount: new Prisma.Decimal(t.operationAmount),
              currency: t.currency,
              cashbackAmount: new Prisma.Decimal(t.cashbackAmount),
              commissionRate: new Prisma.Decimal(t.commissionRate),
              balance: new Prisma.Decimal(t.balance),
              descriptionRaw: t.descriptionRaw,
              merchantNameClean: t.merchantNameClean,
              mcc: t.mcc,
              mccCategory: t.mccCategory,
              transactionType: t.transactionType as any,
              transactionTime: t.transactionTime,
              rawData: t.rawData as any,
            },
            update: {
              merchantNameClean: t.merchantNameClean,
              mccCategory: t.mccCategory,
              balance: new Prisma.Decimal(t.balance),
              // Update type too — earlier versions stored pending Monobank
              // transactions as HOLD; we now classify purely by amount sign.
              transactionType: t.transactionType as any,
            },
          }),
        ),
      );
      count += batch.length;
    }

    return count;
  }

  async findByUserId(
    userId: string,
    filters?: TransactionFilters,
  ): Promise<Transaction[]> {
    const where: Prisma.TransactionWhereInput = { userId };

    if (filters?.from || filters?.to) {
      where.transactionTime = {};
      if (filters.from) where.transactionTime.gte = filters.from;
      if (filters.to) where.transactionTime.lte = filters.to;
    }

    if (filters?.mccCategory) {
      where.mccCategory = filters.mccCategory;
    }

    if (filters?.transactionType) {
      where.transactionType = filters.transactionType as TransactionType;
    }

    return this.prisma.transaction.findMany({
      where,
      orderBy: { transactionTime: 'desc' },
      skip: filters?.skip,
      take: filters?.take ?? 100,
    });
  }

  /** Case-insensitive text search over merchant name and description. */
  async searchByText(
    userId: string,
    query: string,
    from?: Date,
    to?: Date,
    take = 20,
  ): Promise<Transaction[]> {
    const where: Prisma.TransactionWhereInput = {
      userId,
      OR: [
        { merchantNameClean: { contains: query, mode: 'insensitive' } },
        { descriptionRaw: { contains: query, mode: 'insensitive' } },
      ],
    };
    if (from || to) {
      where.transactionTime = {};
      if (from) where.transactionTime.gte = from;
      if (to) where.transactionTime.lte = to;
    }
    return this.prisma.transaction.findMany({
      where,
      orderBy: { transactionTime: 'desc' },
      take,
    });
  }
}
