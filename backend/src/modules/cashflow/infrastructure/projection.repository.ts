import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { CashFlowProjection } from '../domain/projection.entity';
import { ProjectionPoint } from '../domain/value-objects/projection-point.vo';
import { ProjectionRepository } from '../domain/repositories.interface';
import { CashFlowProjectionUpdated } from '../domain/events/cashflow-events';

@Injectable()
export class PrismaProjectionRepository implements ProjectionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
  ) {}

  async saveAsLatest(projection: CashFlowProjection): Promise<void> {
    const snapshot = projection.toSnapshot();
    await this.prisma.$transaction(async (tx) => {
      // Demote any prior latest projections.
      await tx.cashFlowProjection.updateMany({
        where: { userId: snapshot.userId, isLatest: true },
        data: { isLatest: false },
      });

      await tx.cashFlowProjection.create({
        data: {
          id: snapshot.id,
          userId: snapshot.userId,
          horizonDays: snapshot.horizonDays,
          generatedAt: snapshot.generatedAt,
          modelVersion: snapshot.modelVersion,
          confidenceScore: snapshot.confidenceScore,
          payload: { assumptions: snapshot.assumptions } as unknown as Prisma.InputJsonValue,
          isLatest: true,
        },
      });

      // Bulk insert points.
      if (snapshot.points.length > 0) {
        await tx.projectionPoint.createMany({
          data: snapshot.points.map((p) => {
            const ps = p.toSnapshot();
            return {
              projectionId: snapshot.id,
              day: ps.day,
              balanceP10: ps.balanceP10,
              balanceP50: ps.balanceP50,
              balanceP90: ps.balanceP90,
              expectedInflow: ps.expectedInflow,
              expectedOutflow: ps.expectedOutflow,
              hasDeficitRisk: ps.hasDeficitRisk,
            };
          }),
        });
      }

      await this.events.publish(
        new CashFlowProjectionUpdated(
          snapshot.id,
          {
            projectionId: snapshot.id,
            userId: snapshot.userId,
            horizonDays: snapshot.horizonDays,
            modelVersion: snapshot.modelVersion,
            confidenceScore: snapshot.confidenceScore,
            generatedAt: snapshot.generatedAt.toISOString(),
            pointsCount: snapshot.points.length,
          },
          { userId: snapshot.userId },
        ),
        tx,
      );
    });
  }

  async findLatest(userId: string): Promise<CashFlowProjection | null> {
    const row = await this.prisma.cashFlowProjection.findFirst({
      where: { userId, isLatest: true },
      include: { points: { orderBy: { day: 'asc' } } },
    });
    return row ? this.toAggregate(row) : null;
  }

  async findById(id: string): Promise<CashFlowProjection | null> {
    const row = await this.prisma.cashFlowProjection.findUnique({
      where: { id },
      include: { points: { orderBy: { day: 'asc' } } },
    });
    return row ? this.toAggregate(row) : null;
  }

  async listHistory(userId: string, limit: number): Promise<CashFlowProjection[]> {
    const rows = await this.prisma.cashFlowProjection.findMany({
      where: { userId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
      include: { points: { orderBy: { day: 'asc' } } },
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async recordDeficit(input: {
    userId: string;
    projectionId: string;
    predictedFor: Date;
    estimatedAmount: number;
    confidence: number;
  }): Promise<void> {
    await this.prisma.deficitPrediction.create({
      data: {
        userId: input.userId,
        projectionId: input.projectionId,
        predictedFor: input.predictedFor,
        estimatedAmount: input.estimatedAmount,
        confidence: input.confidence,
      },
    });
  }

  async listOpenDeficits(userId: string) {
    const rows = await this.prisma.deficitPrediction.findMany({
      where: { userId, resolvedAt: null },
      orderBy: { predictedFor: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      predictedFor: r.predictedFor,
      estimatedAmount: Number(r.estimatedAmount),
      confidence: Number(r.confidence),
    }));
  }

  private toAggregate(row: {
    id: string;
    userId: string;
    horizonDays: number;
    generatedAt: Date;
    modelVersion: string;
    confidenceScore: Prisma.Decimal | null;
    payload: Prisma.JsonValue;
    isLatest: boolean;
    points: Array<{
      day: Date;
      balanceP10: Prisma.Decimal | null;
      balanceP50: Prisma.Decimal | null;
      balanceP90: Prisma.Decimal | null;
      expectedInflow: Prisma.Decimal | null;
      expectedOutflow: Prisma.Decimal | null;
      hasDeficitRisk: boolean;
    }>;
  }): CashFlowProjection {
    const payload = (row.payload ?? {}) as { assumptions?: Array<{ key: string; value: unknown; source: 'historical' | 'recurring' | 'goal' | 'manual' }> };
    return CashFlowProjection.rehydrate({
      id: row.id,
      userId: row.userId,
      horizonDays: row.horizonDays,
      generatedAt: row.generatedAt,
      modelVersion: row.modelVersion,
      confidenceScore: row.confidenceScore !== null ? Number(row.confidenceScore) : null,
      isLatest: row.isLatest,
      assumptions: payload.assumptions ?? [],
      points: row.points.map(
        (p) =>
          new ProjectionPoint({
            day: p.day,
            balanceP10: new Decimal(p.balanceP10 ?? 0),
            balanceP50: new Decimal(p.balanceP50 ?? 0),
            balanceP90: new Decimal(p.balanceP90 ?? 0),
            expectedInflow: new Decimal(p.expectedInflow ?? 0),
            expectedOutflow: new Decimal(p.expectedOutflow ?? 0),
            hasDeficitRisk: p.hasDeficitRisk,
          }),
      ),
    });
  }
}
