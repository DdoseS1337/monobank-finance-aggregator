import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { Currency, Money } from '../../../shared-kernel/money/money';
import {
  ContributionSource,
  FundingStrategy,
  Goal,
  GoalStatus,
  GoalType,
} from '../domain/goal.entity';
import { GoalRepository } from '../domain/repositories.interface';

type GoalWithRelations = Prisma.GoalGetPayload<{
  include: { contributions: true; milestones: true };
}>;

@Injectable()
export class PrismaGoalRepository implements GoalRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: DomainEventBus,
  ) {}

  async save(goal: Goal): Promise<void> {
    const snapshot = goal.toSnapshot();
    const events = goal.pullEvents();

    await this.prisma.$transaction(async (tx) => {
      await tx.goal.upsert({
        where: { id: snapshot.id },
        create: {
          id: snapshot.id,
          userId: snapshot.userId,
          type: snapshot.type,
          name: snapshot.name,
          description: snapshot.description,
          targetAmount: snapshot.targetAmount.amount,
          currentAmount: snapshot.currentAmount.amount,
          baseCurrency: snapshot.targetAmount.currency,
          deadline: snapshot.deadline,
          priority: snapshot.priority,
          fundingStrategy: snapshot.fundingStrategy,
          fundingParams: snapshot.fundingParams as Prisma.InputJsonValue,
          linkedAccountId: snapshot.linkedAccountId,
          status: snapshot.status,
          feasibilityScore: snapshot.feasibilityScore,
          lastFeasibilityCalcAt: snapshot.lastFeasibilityCalcAt,
          completedAt: snapshot.completedAt,
        },
        update: {
          name: snapshot.name,
          description: snapshot.description,
          targetAmount: snapshot.targetAmount.amount,
          currentAmount: snapshot.currentAmount.amount,
          deadline: snapshot.deadline,
          priority: snapshot.priority,
          fundingStrategy: snapshot.fundingStrategy,
          fundingParams: snapshot.fundingParams as Prisma.InputJsonValue,
          linkedAccountId: snapshot.linkedAccountId,
          status: snapshot.status,
          feasibilityScore: snapshot.feasibilityScore,
          lastFeasibilityCalcAt: snapshot.lastFeasibilityCalcAt,
          completedAt: snapshot.completedAt,
        },
      });

      // Insert any new contributions (idempotent via id PK)
      for (const c of snapshot.contributions) {
        await tx.goalContribution.upsert({
          where: { id: c.id },
          create: {
            id: c.id,
            goalId: snapshot.id,
            amount: c.amount.amount,
            sourceType: c.sourceType,
            sourceRef: c.sourceRef,
            madeAt: c.madeAt,
          },
          update: {},
        });
      }

      // Milestones — composite unique on (goalId, thresholdPct)
      for (const m of snapshot.milestones) {
        await tx.goalMilestone.upsert({
          where: {
            goalId_thresholdPct: {
              goalId: snapshot.id,
              thresholdPct: m.thresholdPct,
            },
          },
          create: {
            goalId: snapshot.id,
            thresholdPct: m.thresholdPct,
            reachedAt: m.reachedAt,
            rewardText: m.rewardText,
          },
          update: {
            reachedAt: m.reachedAt,
            rewardText: m.rewardText,
          },
        });
      }

      for (const event of events) {
        await this.eventBus.publish(event, tx);
      }
    });
  }

  async findById(id: string): Promise<Goal | null> {
    const row = await this.prisma.goal.findUnique({
      where: { id },
      include: { contributions: true, milestones: true },
    });
    return row ? this.toAggregate(row) : null;
  }

  async findByUser(
    userId: string,
    opts: { statuses?: ReadonlyArray<GoalStatus> } = {},
  ): Promise<Goal[]> {
    const rows = await this.prisma.goal.findMany({
      where: {
        userId,
        ...(opts.statuses ? { status: { in: opts.statuses as GoalStatus[] } } : {}),
      },
      include: { contributions: true, milestones: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async findActiveByUser(userId: string): Promise<Goal[]> {
    return this.findByUser(userId, { statuses: ['ACTIVE'] });
  }

  private toAggregate(row: GoalWithRelations): Goal {
    const currency = row.baseCurrency as Currency;
    return Goal.rehydrate({
      id: row.id,
      userId: row.userId,
      type: row.type as GoalType,
      name: row.name,
      description: row.description,
      targetAmount: Money.of(row.targetAmount as unknown as Decimal, currency),
      currentAmount: Money.of(row.currentAmount as unknown as Decimal, currency),
      deadline: row.deadline,
      priority: row.priority,
      fundingStrategy: row.fundingStrategy as FundingStrategy,
      fundingParams: (row.fundingParams as Record<string, unknown>) ?? {},
      linkedAccountId: row.linkedAccountId,
      status: row.status as GoalStatus,
      feasibilityScore:
        row.feasibilityScore !== null
          ? Number(row.feasibilityScore)
          : null,
      lastFeasibilityCalcAt: row.lastFeasibilityCalcAt,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      contributions: row.contributions.map((c) => ({
        id: c.id,
        amount: Money.of(c.amount as unknown as Decimal, currency),
        sourceType: c.sourceType as ContributionSource,
        sourceRef: c.sourceRef,
        madeAt: c.madeAt,
      })),
      milestones: row.milestones.map((m) => ({
        thresholdPct: m.thresholdPct,
        reachedAt: m.reachedAt,
        rewardText: m.rewardText,
      })),
    });
  }
}
