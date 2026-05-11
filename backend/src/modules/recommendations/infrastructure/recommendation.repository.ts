import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { EmbeddingService } from '../../../shared-kernel/ai/embedding.service';
import {
  ExpectedImpact,
  GeneratedBy,
  Recommendation,
  RecommendationActionSpec,
  RecommendationKind,
  RecommendationStatus,
} from '../domain/recommendation.entity';
import {
  ListRecommendationFilter,
  RecommendationRepository,
} from '../domain/repositories.interface';
import { RankingScore } from '../domain/value-objects/ranking-score.vo';

// Explicit column list — `embedding` is a pgvector type that Prisma cannot deserialize
// through $queryRawUnsafe, and toAggregate discards it anyway.
const RECOMMENDATION_COLUMNS = `
  id, user_id, kind, priority, generated_by, generator_metadata,
  generated_at, valid_until, status, payload, explanation,
  expected_impact, ranking_score, ranking_breakdown,
  delivered_at, delivered_via
`;

interface RecommendationRow {
  id: string;
  user_id: string;
  kind: string;
  priority: number;
  generated_by: string;
  generator_metadata: unknown;
  generated_at: Date;
  valid_until: Date | null;
  status: string;
  payload: unknown;
  explanation: string;
  expected_impact: unknown;
  ranking_score: string | null;
  ranking_breakdown: unknown;
  delivered_at: Date | null;
  delivered_via: string | null;
}

@Injectable()
export class PrismaRecommendationRepository implements RecommendationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
  ) {}

  async save(rec: Recommendation): Promise<void> {
    const s = rec.toSnapshot();
    const embeddingLiteral = s.embedding ? EmbeddingService.toPgVector(s.embedding) : null;
    const rankingScoreValue = s.ranking?.total ?? null;
    const rankingBreakdownJson = s.ranking ? JSON.stringify(s.ranking.toJSON()) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `
        INSERT INTO recommendations (
          id, user_id, kind, priority, generated_by, generator_metadata,
          generated_at, valid_until, status, payload, explanation,
          expected_impact, embedding, ranking_score, ranking_breakdown,
          delivered_at, delivered_via
        )
        VALUES (
          $1::uuid, $2::uuid, $3::"recommendation_kind", $4, $5, $6::jsonb,
          $7, $8, $9::"recommendation_status", $10::jsonb, $11,
          $12::jsonb, ${embeddingLiteral ? '$13::vector' : '$13'},
          $14, $15::jsonb, $16, $17
        )
        ON CONFLICT (id) DO UPDATE SET
          status            = EXCLUDED.status,
          ranking_score     = EXCLUDED.ranking_score,
          ranking_breakdown = EXCLUDED.ranking_breakdown,
          delivered_at      = EXCLUDED.delivered_at,
          delivered_via     = EXCLUDED.delivered_via
        `,
        s.id,
        s.userId,
        s.kind,
        s.priority,
        s.generatedBy,
        JSON.stringify(s.generatorMetadata),
        s.generatedAt,
        s.validUntil,
        s.status,
        JSON.stringify(s.payload),
        s.explanation,
        s.expectedImpact ? JSON.stringify(s.expectedImpact) : null,
        embeddingLiteral,
        rankingScoreValue,
        rankingBreakdownJson,
        s.deliveredAt,
        s.deliveredVia,
      );

      // Replace actions atomically (small set per recommendation).
      await tx.recommendationAction.deleteMany({ where: { recommendationId: s.id } });
      if (s.actions.length > 0) {
        await tx.recommendationAction.createMany({
          data: s.actions.map((a) => ({
            recommendationId: s.id,
            actionType: a.actionType,
            targetRef: a.targetRef,
            params: a.params as Prisma.InputJsonValue,
            sequenceOrder: a.sequenceOrder,
          })),
        });
      }
    });
  }

  async findById(id: string): Promise<Recommendation | null> {
    const rows = await this.prisma.$queryRawUnsafe<RecommendationRow[]>(
      `SELECT ${RECOMMENDATION_COLUMNS} FROM recommendations WHERE id = $1::uuid`,
      id,
    );
    if (rows.length === 0) return null;
    const actions = await this.prisma.recommendationAction.findMany({
      where: { recommendationId: id },
      orderBy: { sequenceOrder: 'asc' },
    });
    return this.toAggregate(rows[0]!, actions);
  }

  async list(filter: ListRecommendationFilter): Promise<Recommendation[]> {
    const where: Prisma.RecommendationWhereInput = { userId: filter.userId };
    if (filter.status?.length) where.status = { in: filter.status };
    if (filter.kinds?.length) where.kind = { in: filter.kinds };
    if (filter.validOnly) {
      where.OR = [{ validUntil: null }, { validUntil: { gt: new Date() } }];
    }
    const rows = await this.prisma.recommendation.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { generatedAt: 'desc' }],
      take: Math.min(filter.limit ?? 50, 200),
      include: { actions: { orderBy: { sequenceOrder: 'asc' } } },
    });
    return rows.map((r) =>
      this.toAggregate(
        {
          id: r.id,
          user_id: r.userId,
          kind: r.kind,
          priority: r.priority,
          generated_by: r.generatedBy,
          generator_metadata: r.generatorMetadata,
          generated_at: r.generatedAt,
          valid_until: r.validUntil,
          status: r.status,
          payload: r.payload,
          explanation: r.explanation,
          expected_impact: r.expectedImpact,
          ranking_score: r.rankingScore?.toString() ?? null,
          ranking_breakdown: r.rankingBreakdown,
          delivered_at: r.deliveredAt,
          delivered_via: r.deliveredVia,
        },
        r.actions,
      ),
    );
  }

  async expireStale(): Promise<number> {
    const result = await this.prisma.recommendation.updateMany({
      where: {
        validUntil: { lt: new Date() },
        status: { in: ['PENDING', 'DELIVERED'] },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  async findSimilarRecent(
    userId: string,
    embedding: Float32Array,
    sinceDays: number,
    limit: number,
  ): Promise<Array<{ id: string; status: RecommendationStatus; similarity: number; kind: string }>> {
    const since = dayjs().subtract(sinceDays, 'day').toDate();
    const vec = EmbeddingService.toPgVector(embedding);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; status: string; kind: string; similarity: number }>
    >(
      `
      SELECT id, status, kind,
             1 - (embedding <=> $1::vector) AS similarity
      FROM recommendations
      WHERE user_id = $2::uuid
        AND embedding IS NOT NULL
        AND generated_at >= $3
      ORDER BY embedding <=> $1::vector
      LIMIT $4
      `,
      vec,
      userId,
      since,
      limit,
    );
    return rows.map((r) => ({
      id: r.id,
      status: r.status as RecommendationStatus,
      kind: r.kind,
      similarity: r.similarity,
    }));
  }

  async acceptedCentroid(userId: string): Promise<Float32Array | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ centroid: string | null }>>(
      `
      SELECT AVG(embedding)::text AS centroid
      FROM recommendations
      WHERE user_id = $1::uuid AND status = 'ACCEPTED' AND embedding IS NOT NULL
      `,
      userId,
    );
    const centroidRaw = rows[0]?.centroid;
    if (!centroidRaw) return null;
    const stripped = centroidRaw.replace(/^\[|\]$/g, '');
    return new Float32Array(stripped.split(',').map((n) => Number(n)));
  }

  async recordFeedback(input: {
    recommendationId: string;
    userId: string;
    decision: RecommendationStatus;
    feedbackText?: string | null;
    modifications?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.recommendationFeedback.create({
        data: {
          recommendationId: input.recommendationId,
          userId: input.userId,
          decision: input.decision,
          feedbackText: input.feedbackText ?? null,
          modifications: (input.modifications ?? null) as Prisma.InputJsonValue,
        },
      }),
      this.prisma.recommendation.update({
        where: { id: input.recommendationId },
        data: { status: input.decision },
      }),
    ]);
  }

  private toAggregate(
    row: RecommendationRow,
    actions: Array<{
      id: string;
      actionType: string;
      targetRef: string | null;
      params: Prisma.JsonValue;
      sequenceOrder: number;
    }>,
  ): Recommendation {
    let ranking: RankingScore | null = null;
    if (row.ranking_score !== null && row.ranking_breakdown) {
      const breakdown = row.ranking_breakdown as ReturnType<RankingScore['toJSON']>;
      ranking = new RankingScore(
        Number(row.ranking_score),
        breakdown.breakdown,
        breakdown.weights,
      );
    }
    const actionSpecs: RecommendationActionSpec[] = actions.map((a) => ({
      actionType: a.actionType,
      targetRef: a.targetRef,
      params: (a.params as Record<string, unknown>) ?? {},
      sequenceOrder: a.sequenceOrder,
    }));
    return Recommendation.rehydrate({
      id: row.id,
      userId: row.user_id,
      kind: row.kind as RecommendationKind,
      priority: row.priority,
      generatedBy: row.generated_by as GeneratedBy,
      generatorMetadata: (row.generator_metadata as Record<string, unknown>) ?? {},
      generatedAt: row.generated_at,
      validUntil: row.valid_until,
      status: row.status as RecommendationStatus,
      payload: (row.payload as Record<string, unknown>) ?? {},
      explanation: row.explanation,
      expectedImpact: (row.expected_impact as ExpectedImpact | null) ?? null,
      embedding: null,
      ranking,
      actions: actionSpecs,
      deliveredAt: row.delivered_at,
      deliveredVia: row.delivered_via,
    });
  }
}
