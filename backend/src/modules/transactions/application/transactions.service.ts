import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { Transaction } from '../domain/transaction.entity';
import {
  TRANSACTION_REPOSITORY,
  TransactionFilter,
  TransactionPage,
  TransactionRepository,
} from '../domain/repositories.interface';
import { TransactionRecategorized } from '../domain/events/transaction-events';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: TransactionRepository,
  ) {}

  async list(userId: string, filter: Omit<TransactionFilter, 'userId'>): Promise<TransactionPage> {
    return this.transactions.list({ userId, ...filter });
  }

  async spendingSummary(
    userId: string,
    range: { from?: Date; to?: Date },
  ): Promise<{
    from: string;
    to: string;
    currency: string;
    total: string;
    txCount: number;
    byCategory: Array<{
      categoryId: string | null;
      name: string;
      color: string | null;
      icon: string | null;
      amount: string;
      pct: number;
      txCount: number;
    }>;
  }> {
    const to = range.to ?? new Date();
    const from = range.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId', 'currency'],
      where: {
        userId,
        type: 'DEBIT',
        status: { in: ['POSTED', 'PENDING'] },
        transactionDate: { gte: from, lte: to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const currencyTotals = new Map<string, number>();
    for (const row of grouped) {
      const sum = row._sum.amount?.toNumber() ?? 0;
      currencyTotals.set(row.currency, (currencyTotals.get(row.currency) ?? 0) + sum);
    }
    let dominant = 'UAH';
    let dominantSum = -1;
    for (const [currency, sum] of currencyTotals) {
      if (sum > dominantSum) {
        dominant = currency;
        dominantSum = sum;
      }
    }

    const inDominant = grouped.filter((g) => g.currency === dominant);
    const total = inDominant.reduce(
      (acc, g) => acc + (g._sum.amount?.toNumber() ?? 0),
      0,
    );
    const txCount = inDominant.reduce((acc, g) => acc + g._count._all, 0);

    const categoryIds = inDominant
      .map((g) => g.categoryId)
      .filter((id): id is string => Boolean(id));
    // Load every involved category PLUS each one's full ancestor chain so we
    // can roll subcategories up to their top-level parent for the summary.
    const allCats = await this.loadCategoriesWithAncestors(categoryIds);
    const rootByCategory = this.computeRoots(allCats);

    type Bucket = {
      categoryId: string | null;
      name: string;
      color: string | null;
      icon: string | null;
      amount: number;
      txCount: number;
    };
    const buckets = new Map<string, Bucket>();
    for (const g of inDominant) {
      const amount = g._sum.amount?.toNumber() ?? 0;
      const root = g.categoryId ? rootByCategory.get(g.categoryId) ?? null : null;
      const key = root?.id ?? '__none';
      const existing = buckets.get(key);
      if (existing) {
        existing.amount += amount;
        existing.txCount += g._count._all;
      } else {
        buckets.set(key, {
          categoryId: root?.id ?? null,
          name: root?.name ?? 'Без категорії',
          color: root?.color ?? null,
          icon: root?.icon ?? null,
          amount,
          txCount: g._count._all,
        });
      }
    }

    const byCategory = Array.from(buckets.values())
      .map((b) => ({
        categoryId: b.categoryId,
        name: b.name,
        color: b.color,
        icon: b.icon,
        amount: b.amount.toFixed(2),
        pct: total > 0 ? (b.amount / total) * 100 : 0,
        txCount: b.txCount,
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      currency: dominant,
      total: total.toFixed(2),
      txCount,
      byCategory,
    };
  }

  /**
   * Loads each category and walks up parent_id until the root is reached so
   * the caller can map any leaf category to its top-level ancestor.
   */
  private async loadCategoriesWithAncestors(
    seedIds: string[],
  ): Promise<
    Map<string, { id: string; name: string; color: string | null; icon: string | null; parentId: string | null }>
  > {
    const out = new Map<
      string,
      { id: string; name: string; color: string | null; icon: string | null; parentId: string | null }
    >();
    let frontier = seedIds.filter((id) => !out.has(id));
    while (frontier.length > 0) {
      const rows = await this.prisma.category.findMany({
        where: { id: { in: frontier } },
        select: { id: true, name: true, color: true, icon: true, parentId: true },
      });
      const next: string[] = [];
      for (const r of rows) {
        out.set(r.id, r);
        if (r.parentId && !out.has(r.parentId)) next.push(r.parentId);
      }
      frontier = next;
    }
    return out;
  }

  private computeRoots(
    cats: Map<
      string,
      { id: string; name: string; color: string | null; icon: string | null; parentId: string | null }
    >,
  ): Map<
    string,
    { id: string; name: string; color: string | null; icon: string | null }
  > {
    const out = new Map<
      string,
      { id: string; name: string; color: string | null; icon: string | null }
    >();
    for (const id of cats.keys()) {
      let cursor = id;
      let safety = 0;
      while (safety++ < 16) {
        const row = cats.get(cursor);
        if (!row) break;
        if (!row.parentId) {
          out.set(id, {
            id: row.id,
            name: row.name,
            color: row.color,
            icon: row.icon,
          });
          break;
        }
        cursor = row.parentId;
      }
    }
    return out;
  }

  async getOne(userId: string, transactionId: string): Promise<Transaction> {
    const tx = await this.transactions.findById(transactionId);
    if (!tx || tx.userId !== userId) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }
    return tx;
  }

  async recategorize(
    userId: string,
    transactionId: string,
    newCategoryId: string,
  ): Promise<Transaction> {
    const tx = await this.getOne(userId, transactionId);
    const exists = await this.prisma.category.findUnique({
      where: { id: newCategoryId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Category ${newCategoryId} not found`);
    }

    const { previousCategoryId } = tx.recategorize(newCategoryId);

    await this.prisma.$transaction(async (txClient) => {
      await txClient.transaction.update({
        where: { id: transactionId },
        data: { categoryId: newCategoryId },
      });
      await this.events.publish(
        new TransactionRecategorized(
          transactionId,
          {
            transactionId,
            userId,
            oldCategoryId: previousCategoryId,
            newCategoryId,
            source: 'USER',
          },
          { userId },
        ),
        txClient,
      );
    });
    return tx;
  }
}
