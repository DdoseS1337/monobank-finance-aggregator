import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { Money, Currency } from '../../../shared-kernel/money/money';
import { Period } from '../../../shared-kernel/period/period';
import {
  Budget,
  BudgetMethod,
  BudgetStatus,
  Cadence,
  RolloverPolicy,
} from '../domain/budget.entity';
import { BudgetPeriod } from '../domain/budget-period.entity';
import { BudgetLine } from '../domain/budget-line.entity';
import { BudgetRepository } from '../domain/repositories.interface';

type BudgetWithRelations = Prisma.BudgetGetPayload<{
  include: { periods: { include: { lines: true } } };
}>;

@Injectable()
export class PrismaBudgetRepository implements BudgetRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: DomainEventBus,
  ) {}

  async save(budget: Budget): Promise<void> {
    const snapshot = budget.toSnapshot();
    const events = budget.pullEvents();

    await this.prisma.$transaction(async (tx) => {
      await tx.budget.upsert({
        where: { id: snapshot.id },
        create: {
          id: snapshot.id,
          userId: snapshot.userId,
          name: snapshot.name,
          method: snapshot.method,
          cadence: snapshot.cadence,
          baseCurrency: snapshot.baseCurrency,
          rolloverPolicy: snapshot.rolloverPolicy,
          status: snapshot.status,
          metadata: snapshot.metadata as Prisma.InputJsonValue,
        },
        update: {
          name: snapshot.name,
          status: snapshot.status,
          rolloverPolicy: snapshot.rolloverPolicy,
          metadata: snapshot.metadata as Prisma.InputJsonValue,
        },
      });

      for (const period of snapshot.periods) {
        const periodSnap = period.toSnapshot();
        await tx.budgetPeriod.upsert({
          where: { id: periodSnap.id },
          create: {
            id: periodSnap.id,
            budgetId: periodSnap.budgetId,
            periodStart: periodSnap.period.start,
            periodEnd: periodSnap.period.end,
            status: periodSnap.status,
            openingBalance: periodSnap.openingBalance?.amount ?? null,
            closingBalance: periodSnap.closingBalance?.amount ?? null,
          },
          update: {
            status: periodSnap.status,
            closingBalance: periodSnap.closingBalance?.amount ?? null,
          },
        });

        for (const line of periodSnap.lines) {
          const lineSnap = line.toSnapshot();
          await tx.budgetLine.upsert({
            where: { id: lineSnap.id },
            create: {
              id: lineSnap.id,
              budgetPeriodId: lineSnap.budgetPeriodId,
              categoryId: lineSnap.categoryId,
              plannedAmount: lineSnap.plannedAmount.amount,
              spentAmount: lineSnap.spentAmount.amount,
              thresholdPct: lineSnap.thresholdPct,
              status: lineSnap.status,
            },
            update: {
              plannedAmount: lineSnap.plannedAmount.amount,
              spentAmount: lineSnap.spentAmount.amount,
              thresholdPct: lineSnap.thresholdPct,
              status: lineSnap.status,
            },
          });
        }
      }

      for (const event of events) {
        await this.eventBus.publish(event, tx);
      }
    });
  }

  async findById(id: string): Promise<Budget | null> {
    const row = await this.prisma.budget.findUnique({
      where: { id },
      include: { periods: { include: { lines: true } } },
    });
    return row ? this.toAggregate(row) : null;
  }

  async findByUser(
    userId: string,
    opts: { includeArchived?: boolean } = {},
  ): Promise<Budget[]> {
    const rows = await this.prisma.budget.findMany({
      where: {
        userId,
        ...(opts.includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
      },
      include: { periods: { include: { lines: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async findActiveForCategory(userId: string, categoryId: string): Promise<Budget | null> {
    const row = await this.prisma.budget.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        periods: {
          some: {
            status: 'OPEN',
            lines: { some: { categoryId } },
          },
        },
      },
      include: { periods: { include: { lines: true } } },
    });
    return row ? this.toAggregate(row) : null;
  }

  async findActiveForCategories(
    userId: string,
    categoryIds: string[],
  ): Promise<Budget | null> {
    if (categoryIds.length === 0) return null;
    const row = await this.prisma.budget.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        periods: {
          some: {
            status: 'OPEN',
            lines: { some: { categoryId: { in: categoryIds } } },
          },
        },
      },
      include: { periods: { include: { lines: true } } },
    });
    return row ? this.toAggregate(row) : null;
  }

  private toAggregate(row: BudgetWithRelations): Budget {
    const currency = row.baseCurrency as Currency;
    const periods = row.periods.map((p) =>
      BudgetPeriod.rehydrate({
        id: p.id,
        budgetId: p.budgetId,
        period: Period.of(p.periodStart, p.periodEnd),
        status: p.status as 'OPEN' | 'CLOSED' | 'ARCHIVED',
        openingBalance:
          p.openingBalance !== null ? Money.of(p.openingBalance as unknown as Decimal, currency) : null,
        closingBalance:
          p.closingBalance !== null ? Money.of(p.closingBalance as unknown as Decimal, currency) : null,
        lines: p.lines.map((l) =>
          BudgetLine.rehydrate({
            id: l.id,
            budgetPeriodId: l.budgetPeriodId,
            categoryId: l.categoryId,
            plannedAmount: Money.of(l.plannedAmount as unknown as Decimal, currency),
            spentAmount: Money.of(l.spentAmount as unknown as Decimal, currency),
            thresholdPct: l.thresholdPct,
            status: l.status as 'OK' | 'WARNING' | 'EXCEEDED',
          }),
        ),
      }),
    );

    return Budget.rehydrate({
      id: row.id,
      userId: row.userId,
      name: row.name,
      method: row.method as BudgetMethod,
      cadence: row.cadence as Cadence,
      baseCurrency: currency,
      rolloverPolicy: row.rolloverPolicy as RolloverPolicy,
      status: row.status as BudgetStatus,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      periods,
    });
  }
}
