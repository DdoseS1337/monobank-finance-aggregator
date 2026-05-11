import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';

/**
 * Snapshot of the user's financial state passed to all generators.
 *
 * Built once per pipeline run so each generator does not re-query the DB.
 */
export interface UserContext {
  userId: string;
  /** Active accounts and their summed balance. */
  totalBalance: number;
  baseCurrency: string;
  /** Active budgets with their per-line health summary. */
  budgets: Array<{
    id: string;
    name: string;
    method: string;
    healthStatus: 'GREEN' | 'YELLOW' | 'RED';
    lines: Array<{
      lineId: string;
      categoryId: string | null;
      plannedAmount: number;
      spentAmount: number;
      spentPct: number;
      status: 'OK' | 'WARNING' | 'EXCEEDED';
    }>;
  }>;
  /** Active financial goals with feasibility scores. */
  goals: Array<{
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    progressPct: number;
    feasibilityScore: number | null;
    deadline: Date | null;
    priority: number;
  }>;
  /** Latest cashflow projection (deficit windows are derived later). */
  cashflow: {
    projectionId: string | null;
    horizonDays: number;
    confidenceScore: number | null;
    nextDeficit: { day: Date; estimatedAmount: number; confidence: number } | null;
  };
  /** Active subscriptions. */
  subscriptions: Array<{
    id: string;
    merchantName: string;
    estimatedAmount: number;
    cadence: string;
    isEssential: boolean;
    unusedDaysCount: number | null;
  }>;
  /** Last 30 days, aggregated by category slug for trend hints. */
  recentSpendingByCategory: Array<{
    categoryId: string;
    categorySlug: string | null;
    total: number;
    transactions: number;
  }>;
}

@Injectable()
export class ContextBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  async build(userId: string): Promise<UserContext> {
    const [accounts, budgetsData, goalsData, projection, subs, recent] = await Promise.all([
      this.prisma.account.findMany({
        where: { userId, archivedAt: null },
        select: { balance: true, currency: true },
      }),
      this.prisma.budget.findMany({
        where: { userId, status: 'ACTIVE' },
        include: {
          periods: {
            where: { status: 'OPEN' },
            include: { lines: true },
            take: 1,
          },
        },
      }),
      this.prisma.goal.findMany({
        where: { userId, status: 'ACTIVE' },
      }),
      this.prisma.cashFlowProjection.findFirst({
        where: { userId, isLatest: true },
        include: {
          deficitPredictions: {
            where: { resolvedAt: null },
            orderBy: { predictedFor: 'asc' },
            take: 1,
          },
        },
      }),
      this.prisma.subscription.findMany({
        where: { userId, status: 'ACTIVE' },
      }),
      this.recentSpending(userId),
    ]);

    const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
    const baseCurrency = accounts[0]?.currency ?? 'UAH';

    return {
      userId,
      totalBalance,
      baseCurrency,
      budgets: budgetsData.map((b) => {
        const period = b.periods[0];
        const lines = (period?.lines ?? []).map((l) => {
          const planned = Number(l.plannedAmount);
          const spent = Number(l.spentAmount);
          const pct = planned > 0 ? Math.round((spent / planned) * 100) : 0;
          return {
            lineId: l.id,
            categoryId: l.categoryId,
            plannedAmount: planned,
            spentAmount: spent,
            spentPct: pct,
            status: l.status as 'OK' | 'WARNING' | 'EXCEEDED',
          };
        });
        const exceeded = lines.filter((l) => l.status === 'EXCEEDED').length;
        const warning = lines.filter((l) => l.status === 'WARNING').length;
        const healthStatus: 'GREEN' | 'YELLOW' | 'RED' =
          exceeded > 0 ? 'RED' : warning > 0 ? 'YELLOW' : 'GREEN';
        return {
          id: b.id,
          name: b.name,
          method: b.method,
          healthStatus,
          lines,
        };
      }),
      goals: goalsData.map((g) => {
        const target = Number(g.targetAmount);
        const current = Number(g.currentAmount);
        return {
          id: g.id,
          name: g.name,
          targetAmount: target,
          currentAmount: current,
          progressPct: target > 0 ? Math.round((current / target) * 100) : 0,
          feasibilityScore: g.feasibilityScore !== null ? Number(g.feasibilityScore) : null,
          deadline: g.deadline,
          priority: g.priority,
        };
      }),
      cashflow: {
        projectionId: projection?.id ?? null,
        horizonDays: projection?.horizonDays ?? 0,
        confidenceScore: projection?.confidenceScore !== null && projection !== null
          ? Number(projection.confidenceScore)
          : null,
        nextDeficit: projection?.deficitPredictions[0]
          ? {
              day: projection.deficitPredictions[0].predictedFor,
              estimatedAmount: Number(projection.deficitPredictions[0].estimatedAmount),
              confidence: Number(projection.deficitPredictions[0].confidence),
            }
          : null,
      },
      subscriptions: subs.map((s) => ({
        id: s.id,
        merchantName: s.merchantName,
        estimatedAmount: Number(s.estimatedAmount),
        cadence: s.cadence,
        isEssential: s.isEssential,
        unusedDaysCount: s.unusedDaysCount,
      })),
      recentSpendingByCategory: recent,
    };
  }

  private async recentSpending(userId: string) {
    const since = dayjs().subtract(30, 'day').toDate();
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'DEBIT',
        transactionDate: { gte: since },
        categoryId: { not: null },
      },
      _sum: { amount: true },
      _count: true,
    });
    if (rows.length === 0) return [];
    const categoryIds = rows.map((r) => r.categoryId).filter((id): id is string => id !== null);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, slug: true },
    });
    const slugById = new Map(categories.map((c) => [c.id, c.slug]));
    return rows.map((r) => ({
      categoryId: r.categoryId!,
      categorySlug: slugById.get(r.categoryId!) ?? null,
      total: Number(r._sum.amount ?? 0),
      transactions: r._count,
    }));
  }
}
