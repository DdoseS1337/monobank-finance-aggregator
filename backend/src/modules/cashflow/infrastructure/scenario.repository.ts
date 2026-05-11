import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { Scenario, ScenarioOutcome, ScenarioVariableKind } from '../domain/scenario.entity';
import { ScenarioRepository } from '../domain/repositories.interface';

@Injectable()
export class PrismaScenarioRepository implements ScenarioRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(scenario: Scenario): Promise<void> {
    const s = scenario.toSnapshot();
    await this.prisma.scenario.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        userId: s.userId,
        name: s.name,
        baselineProjectionId: s.baselineProjectionId,
        variables: s.variables as unknown as Prisma.InputJsonValue,
        outcomes: (s.outcomes ?? null) as unknown as Prisma.InputJsonValue,
        computedAt: s.computedAt,
      },
      update: {
        name: s.name,
        baselineProjectionId: s.baselineProjectionId,
        variables: s.variables as unknown as Prisma.InputJsonValue,
        outcomes: (s.outcomes ?? null) as unknown as Prisma.InputJsonValue,
        computedAt: s.computedAt,
      },
    });
  }

  async findById(id: string): Promise<Scenario | null> {
    const row = await this.prisma.scenario.findUnique({ where: { id } });
    return row ? this.toAggregate(row) : null;
  }

  async findByUser(userId: string): Promise<Scenario[]> {
    const rows = await this.prisma.scenario.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.scenario.delete({ where: { id } });
  }

  private toAggregate(row: {
    id: string;
    userId: string;
    name: string;
    baselineProjectionId: string | null;
    variables: Prisma.JsonValue;
    outcomes: Prisma.JsonValue;
    computedAt: Date | null;
    createdAt: Date;
  }): Scenario {
    return Scenario.rehydrate({
      id: row.id,
      userId: row.userId,
      name: row.name,
      baselineProjectionId: row.baselineProjectionId,
      variables: (row.variables as unknown as ScenarioVariableKind[]) ?? [],
      outcomes: (row.outcomes as unknown as ScenarioOutcome[] | null) ?? null,
      computedAt: row.computedAt,
      createdAt: row.createdAt,
    });
  }
}
