import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared-kernel/prisma/prisma.service';
import { EmbeddingService } from '../../shared-kernel/ai/embedding.service';

export interface KnowledgeArticleHit {
  id: string;
  title: string;
  section: string | null;
  source: string;
  content: string;
  lang: string;
  version: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

interface RawHit {
  id: string;
  title: string;
  section: string | null;
  source: string;
  content: string;
  lang: string;
  version: string | null;
  metadata: unknown;
  similarity: number;
}

/**
 * RAG over the knowledge base of UA financial-literacy articles.
 *
 * Embeddings are stored in `knowledge_documents.embedding` (pgvector(1536)).
 * Search uses cosine similarity (`<=>` operator). The full article body is
 * returned so the calling agent can quote it verbatim — chunking is not done
 * here because each seed article is intentionally kept short (~300-500 words)
 * to fit comfortably in a single context window.
 */
@Injectable()
export class EducationService {
  private readonly logger = new Logger(EducationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async search(
    query: string,
    opts: { k?: number; lang?: string } = {},
  ): Promise<KnowledgeArticleHit[]> {
    const k = Math.max(1, Math.min(opts.k ?? 5, 20));
    const lang = opts.lang ?? 'uk';

    const trimmed = query.trim();
    if (!trimmed) return [];

    const vector = await this.embeddings.embed(trimmed);
    if (!vector) {
      this.logger.warn(
        'Embedding service returned null — falling back to keyword ILIKE',
      );
      return this.fallbackKeywordSearch(trimmed, k, lang);
    }

    const literal = EmbeddingService.toPgVector(vector);
    const rows = await this.prisma.$queryRawUnsafe<RawHit[]>(
      `
        SELECT
          id::text          AS id,
          title,
          section,
          source,
          content,
          lang,
          version,
          metadata,
          1 - (embedding <=> $1::vector) AS similarity
        FROM knowledge_documents
        WHERE lang = $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3
      `,
      literal,
      lang,
      k,
    );

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      section: r.section,
      source: r.source,
      content: r.content,
      lang: r.lang,
      version: r.version,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      similarity: Number(r.similarity ?? 0),
    }));
  }

  async list(lang = 'uk'): Promise<KnowledgeArticleHit[]> {
    const rows = await this.prisma.knowledgeDocument.findMany({
      where: { lang },
      orderBy: [{ section: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        section: true,
        source: true,
        content: true,
        lang: true,
        version: true,
        metadata: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      section: r.section,
      source: r.source,
      content: r.content,
      lang: r.lang,
      version: r.version,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      similarity: 0,
    }));
  }

  /**
   * No-LLM fallback: simple ILIKE on title/content. Used when embedding
   * service is unavailable so the tool still returns *something*.
   */
  private async fallbackKeywordSearch(
    query: string,
    k: number,
    lang: string,
  ): Promise<KnowledgeArticleHit[]> {
    const rows = await this.prisma.knowledgeDocument.findMany({
      where: {
        lang,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: k,
      select: {
        id: true,
        title: true,
        section: true,
        source: true,
        content: true,
        lang: true,
        version: true,
        metadata: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      section: r.section,
      source: r.source,
      content: r.content,
      lang: r.lang,
      version: r.version,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      similarity: 0,
    }));
  }
}
