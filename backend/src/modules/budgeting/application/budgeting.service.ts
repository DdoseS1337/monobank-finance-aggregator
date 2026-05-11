import { randomUUID } from 'crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type Decimal from 'decimal.js';
import { Money, Currency } from '../../../shared-kernel/money/money';
import { Period } from '../../../shared-kernel/period/period';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import {
  Budget,
  BudgetMethod,
  Cadence,
  RolloverPolicy,
} from '../domain/budget.entity';
import { BudgetLine } from '../domain/budget-line.entity';
import {
  BUDGET_REPOSITORY,
  BudgetRepository,
} from '../domain/repositories.interface';
import { BudgetHealth } from '../domain/value-objects/budget-health.vo';

export interface CreateBudgetInput {
  userId: string;
  name: string;
  method: BudgetMethod;
  cadence: Cadence;
  baseCurrency: Currency;
  rolloverPolicy?: RolloverPolicy;
  startNow?: boolean;
  initialLines?: Array<{
    categoryId: string | null;
    plannedAmount: string;
    thresholdPct?: number;
  }>;
}

export interface AddLineInput {
  budgetId: string;
  categoryId: string | null;
  plannedAmount: string;
  thresholdPct?: number;
}

export interface AdjustLineInput {
  budgetId: string;
  lineId: string;
  newPlannedAmount: string;
}

@Injectable()
export class BudgetingService {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createBudget(input: CreateBudgetInput): Promise<Budget> {
    const budget = Budget.create({
      userId: input.userId,
      name: input.name,
      method: input.method,
      cadence: input.cadence,
      baseCurrency: input.baseCurrency,
      rolloverPolicy: input.rolloverPolicy,
    });

    if (input.startNow ?? true) {
      const period = this.derivePeriod(input.cadence);
      budget.startPeriod(period);

      for (const line of input.initialLines ?? []) {
        budget.addLine(
          BudgetLine.create({
            id: randomUUID(),
            budgetPeriodId: budget.currentPeriod()!.id,
            categoryId: line.categoryId,
            plannedAmount: Money.of(line.plannedAmount, input.baseCurrency),
            thresholdPct: line.thresholdPct ?? 80,
          }),
        );
      }
    }

    await this.budgets.save(budget);
    await this.recomputeSpentFromHistory(budget.id);
    const refreshed = await this.budgets.findById(budget.id);
    return refreshed ?? budget;
  }

  async addLine(userId: string, input: AddLineInput): Promise<Budget> {
    const budget = await this.requireBudget(userId, input.budgetId);
    const current = budget.currentPeriod();
    if (!current) {
      throw new Error('Budget has no open period');
    }
    budget.addLine(
      BudgetLine.create({
        id: randomUUID(),
        budgetPeriodId: current.id,
        categoryId: input.categoryId,
        plannedAmount: Money.of(input.plannedAmount, budget.baseCurrency),
        thresholdPct: input.thresholdPct ?? 80,
      }),
    );
    await this.budgets.save(budget);
    await this.recomputeSpentFromHistory(budget.id);
    const refreshed = await this.budgets.findById(budget.id);
    return refreshed ?? budget;
  }

  async removeLine(
    userId: string,
    input: { budgetId: string; lineId: string },
  ): Promise<Budget> {
    const budget = await this.requireBudget(userId, input.budgetId);
    const period = budget.currentPeriod();
    if (!period) {
      throw new NotFoundException('No open period');
    }
    const exists = period.lines.find((l) => l.id === input.lineId);
    if (!exists) {
      throw new NotFoundException(`Line ${input.lineId} not found`);
    }
    // The aggregate persists via upsert and never prunes missing children,
    // so we delete the row directly. The save() below still runs to refresh
    // any other touched state on the aggregate.
    await this.prisma.budgetLine.delete({ where: { id: input.lineId } });
    const refreshed = await this.budgets.findById(input.budgetId);
    return refreshed ?? budget;
  }

  async adjustLine(userId: string, input: AdjustLineInput): Promise<Budget> {
    const budget = await this.requireBudget(userId, input.budgetId);
    const current = budget.currentPeriod();
    if (!current) {
      throw new NotFoundException('No open period');
    }
    const line = current.lines.find((l) => l.id === input.lineId);
    if (!line) throw new NotFoundException(`Line ${input.lineId} not found`);
    line.adjustPlanned(Money.of(input.newPlannedAmount, budget.baseCurrency));
    await this.budgets.save(budget);
    return budget;
  }

  async archive(userId: string, budgetId: string): Promise<Budget> {
    const budget = await this.requireBudget(userId, budgetId);
    budget.archive();
    await this.budgets.save(budget);
    return budget;
  }

  async listBudgets(userId: string, includeArchived = false): Promise<Budget[]> {
    return this.budgets.findByUser(userId, { includeArchived });
  }

  async getBudget(userId: string, budgetId: string): Promise<Budget> {
    return this.requireBudget(userId, budgetId);
  }

  async getHealth(userId: string, budgetId: string): Promise<BudgetHealth> {
    const budget = await this.requireBudget(userId, budgetId);
    return budget.evaluateHealth();
  }

  /**
   * Called by the categorization → budget saga when a transaction is
   * mapped to a category. We add the spend to the matching budget line
   * (if any) and persist; downstream events will be emitted by the saga.
   *
   * Hierarchical roll-up: a transaction categorised as `Food/Restaurants`
   * matches a budget line on `Food/Restaurants` first; if none exists, it
   * falls back to a line on its parent (`Food`). Most-specific match wins.
   */
  async applyCategorizedSpending(input: {
    userId: string;
    categoryId: string;
    amount: Money;
  }): Promise<{ budget: Budget; matchedLineCategoryId: string } | null> {
    const ancestorIds = await this.getCategoryAncestorChain(input.categoryId);
    const budget = await this.budgets.findActiveForCategories(
      input.userId,
      ancestorIds,
    );
    if (!budget) return null;
    const period = budget.currentPeriod();
    if (!period) return null;

    let line: BudgetLine | undefined;
    let matchedCategoryId: string | undefined;
    for (const id of ancestorIds) {
      const candidate = period.findLineByCategory(id);
      if (candidate) {
        line = candidate;
        matchedCategoryId = id;
        break;
      }
    }
    if (!line || !matchedCategoryId) return null;

    if (input.amount.currency !== budget.baseCurrency) {
      // Cross-currency conversion not in scope for v1; leave a domain hook here.
      throw new Error('Currency conversion not implemented yet');
    }
    line.setSpent(line.spentAmount.add(input.amount));
    await this.budgets.save(budget);
    return { budget, matchedLineCategoryId: matchedCategoryId };
  }

  /**
   * Resets every line's spentAmount and replays all DEBIT transactions in
   * the current period through the same most-specific-match logic the saga
   * uses. This is what makes a freshly-created (or freshly-extended) budget
   * reflect existing transactions instead of starting at zero.
   */
  async recomputeSpentFromHistory(budgetId: string): Promise<Budget | null> {
    const budget = await this.budgets.findById(budgetId);
    if (!budget) return null;
    const period = budget.currentPeriod();
    if (!period) return budget;

    const zero = Money.of(0, budget.baseCurrency);
    for (const line of period.lines) {
      line.setSpent(zero);
    }

    const txs = await this.prisma.transaction.findMany({
      where: {
        userId: budget.userId,
        type: 'DEBIT',
        status: { in: ['POSTED', 'PENDING'] },
        currency: budget.baseCurrency,
        categoryId: { not: null },
        transactionDate: {
          gte: period.period.start,
          lte: period.period.end,
        },
      },
      select: { categoryId: true, amount: true },
    });

    if (txs.length === 0) {
      await this.budgets.save(budget);
      return budget;
    }

    const distinctCategoryIds = Array.from(
      new Set(
        txs
          .map((t) => t.categoryId)
          .filter((id): id is string => id !== null),
      ),
    );
    const ancestorByCategory = new Map<string, string[]>();
    for (const id of distinctCategoryIds) {
      ancestorByCategory.set(id, await this.getCategoryAncestorChain(id));
    }

    const linesByCategoryId = new Map<string, BudgetLine>();
    for (const line of period.lines) {
      if (line.categoryId) linesByCategoryId.set(line.categoryId, line);
    }

    for (const tx of txs) {
      if (!tx.categoryId) continue;
      const chain = ancestorByCategory.get(tx.categoryId) ?? [];
      for (const cid of chain) {
        const line = linesByCategoryId.get(cid);
        if (line) {
          line.setSpent(
            line.spentAmount.add(
              Money.of(tx.amount as unknown as Decimal.Value, budget.baseCurrency),
            ),
          );
          break;
        }
      }
    }

    await this.budgets.save(budget);
    return budget;
  }

  /**
   * Returns the leaf category id followed by each ancestor up to the root.
   * Order matters: callers loop from leaf → root to honour most-specific
   * matches.
   */
  private async getCategoryAncestorChain(
    leafId: string,
  ): Promise<string[]> {
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | null = leafId;
    while (current && !seen.has(current)) {
      seen.add(current);
      chain.push(current);
      const row: { parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: current },
          select: { parentId: true },
        });
      current = row?.parentId ?? null;
    }
    return chain;
  }

  private async requireBudget(userId: string, budgetId: string): Promise<Budget> {
    const budget = await this.budgets.findById(budgetId);
    if (!budget || budget.userId !== userId) {
      throw new NotFoundException(`Budget ${budgetId} not found`);
    }
    return budget;
  }

  private derivePeriod(cadence: Cadence): Period {
    switch (cadence) {
      case 'WEEKLY':
        return Period.currentWeek();
      case 'MONTHLY':
        return Period.currentMonth();
      case 'CUSTOM':
        return Period.currentMonth();
    }
  }
}
