import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';
import { DomainEventBus } from '../../../../shared-kernel/events/domain-event-bus';
import { EmbeddingService } from '../../../../shared-kernel/ai/embedding.service';
import { MemoryKind, MemoryRecord } from '../domain/memory-record.entity';
import {
  MemoryQuery,
  MemoryRepository,
  RecallResult,
} from '../domain/repositories.interface';
import { MemoryWritten } from '../domain/events/memory-events';

interface MemoryRow {
  id: string;
  user_id: string;
  kind: string;
  content: string;
  metadata: unknown;
  importance_score: string;
  decay_factor: string;
  source_type: string | null;
  source_ref: string | null;
  related_entities: string[];
  created_at: Date;
  accessed_at: Date;
  access_count: number;
  superseded_by: string | null;
  similarity?: number;
}

const DEFAULT_TOP_K = 8;

// Explicit column list — `embedding` is a pgvector type that Prisma cannot deserialize
// through $queryRawUnsafe, and callers don't need it back (toAggregate sets it to null).
const MEMORY_COLUMNS = `
  id, user_id, kind, content, metadata,
  importance_score, decay_factor, source_type, source_ref,
  related_entities, created_at, accessed_at, access_count, superseded_by
`;

@Injectable()
export class PrismaMemoryRepository implements MemoryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
  ) {}

  async save(record: MemoryRecord): Promise<void> {
    const s = record.toSnapshot();
    await this.prisma.$transaction(async (tx) => {
      // Embeddings need raw SQL because Prisma doesn't model `vector` typed columns.
      const vectorLiteral = s.embedding
        ? EmbeddingService.toPgVector(s.embedding)
        : null;

      await tx.$executeRawUnsafe(
        `
        INSERT INTO memory_records (
          id, user_id, kind, content, embedding, metadata,
          importance_score, decay_factor, source_type, source_ref,
          related_entities, created_at, accessed_at, access_count, superseded_by
        )
        VALUES (
          $1::uuid, $2::uuid, $3::"memory_kind", $4, ${vectorLiteral ? `$5::vector` : '$5'},
          $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15::uuid
        )
        ON CONFLICT (id) DO UPDATE SET
          content           = EXCLUDED.content,
          embedding         = EXCLUDED.embedding,
          metadata          = EXCLUDED.metadata,
          importance_score  = EXCLUDED.importance_score,
          decay_factor      = EXCLUDED.decay_factor,
          accessed_at       = EXCLUDED.accessed_at,
          access_count      = EXCLUDED.access_count,
          superseded_by     = EXCLUDED.superseded_by
        `,
        s.id,
        s.userId,
        s.kind,
        s.content,
        vectorLiteral,
        JSON.stringify(s.metadata),
        s.importanceScore.toString(),
        s.decayFactor.toString(),
        s.sourceType,
        s.sourceRef,
        s.relatedEntities,
        s.createdAt,
        s.accessedAt,
        s.accessCount,
        s.supersededById,
      );

      await this.events.publish(
        new MemoryWritten(
          s.id,
          {
            recordId: s.id,
            userId: s.userId,
            kind: s.kind,
            importance: s.importanceScore,
          },
          { userId: s.userId },
        ),
        tx,
      );
    });
  }

  async findById(id: string): Promise<MemoryRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<MemoryRow[]>(
      `SELECT ${MEMORY_COLUMNS} FROM memory_records WHERE id = $1::uuid`,
      id,
    );
    return rows.length > 0 ? this.toAggregate(rows[0]!) : null;
  }

  async recall(query: MemoryQuery): Promise<RecallResult[]> {
    const topK = Math.min(query.topK ?? DEFAULT_TOP_K, 50);
    const kinds = query.kinds && query.kinds.length > 0 ? query.kinds : ['SEMANTIC', 'EPISODIC', 'PROCEDURAL'];

    if (query.embedding) {
      // pgvector cosine distance: smaller = closer; we convert to similarity
      // via 1 - distance and order by distance asc.
      const vec = EmbeddingService.toPgVector(query.embedding);
      const supersededFilter = query.excludeSuperseded
        ? 'AND superseded_by IS NULL'
        : '';
      const rows = await this.prisma.$queryRawUnsafe<MemoryRow[]>(
        `
        SELECT ${MEMORY_COLUMNS},
               1 - (embedding <=> $1::vector) AS similarity
        FROM memory_records
        WHERE user_id = $2::uuid
          AND kind = ANY($3::"memory_kind"[])
          AND embedding IS NOT NULL
          ${supersededFilter}
        ORDER BY embedding <=> $1::vector
        LIMIT $4
        `,
        vec,
        query.userId,
        kinds,
        topK,
      );
      return rows.map((r) => ({
        record: this.toAggregate(r),
        score: r.similarity ?? 0,
      }));
    }

    // Fallback: keyword + recency.
    const supersededFilter = query.excludeSuperseded ? 'AND superseded_by IS NULL' : '';
    const searchFilter = query.searchText ? `AND content ILIKE '%' || $4 || '%'` : '';
    const params: unknown[] = [query.userId, kinds, topK];
    if (query.searchText) params.push(query.searchText);
    const rows = await this.prisma.$queryRawUnsafe<MemoryRow[]>(
      `
      SELECT ${MEMORY_COLUMNS}
      FROM memory_records
      WHERE user_id = $1::uuid
        AND kind = ANY($2::"memory_kind"[])
        ${supersededFilter}
        ${searchFilter}
      ORDER BY importance_score * decay_factor DESC, accessed_at DESC
      LIMIT $3
      `,
      ...params,
    );
    return rows.map((r) => ({
      record: this.toAggregate(r),
      score: Number(r.importance_score) * Number(r.decay_factor),
    }));
  }

  async episodicSince(userId: string, cutoff: Date, limit: number): Promise<MemoryRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<MemoryRow[]>(
      `
      SELECT ${MEMORY_COLUMNS} FROM memory_records
      WHERE user_id = $1::uuid
        AND kind = 'EPISODIC'
        AND created_at >= $2
        AND superseded_by IS NULL
      ORDER BY created_at DESC
      LIMIT $3
      `,
      userId,
      cutoff,
      limit,
    );
    return rows.map((r) => this.toAggregate(r));
  }

  async decayBelowThreshold(threshold: number, factor: number): Promise<number> {
    const result = await this.prisma.$executeRawUnsafe(
      `
      UPDATE memory_records
      SET decay_factor = LEAST(decay_factor, $2)
      WHERE importance_score < $1
        AND decay_factor > $2
      `,
      threshold,
      factor,
    );
    return Number(result);
  }

  async markSuperseded(ids: string[], supersedingId: string): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE memory_records SET superseded_by = $1::uuid WHERE id = ANY($2::uuid[])`,
      supersedingId,
      ids,
    );
    return Number(result);
  }

  private toAggregate(row: MemoryRow): MemoryRecord {
    return MemoryRecord.rehydrate({
      id: row.id,
      userId: row.user_id,
      kind: row.kind as MemoryKind,
      content: row.content,
      // Embedding stays opaque on retrieval — we don't ship it back into JS to
      // save memory; if a caller needs it (rare), they can refetch via raw SQL.
      embedding: null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      importanceScore: Number(row.importance_score),
      decayFactor: Number(row.decay_factor),
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      relatedEntities: row.related_entities ?? [],
      createdAt: row.created_at,
      accessedAt: row.accessed_at,
      accessCount: row.access_count,
      supersededById: row.superseded_by,
    });
  }
}
