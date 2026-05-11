import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../../../../shared-kernel/ai/embedding.service';
import { MemoryKind, MemoryRecord } from '../domain/memory-record.entity';
import {
  MEMORY_REPOSITORY,
  MemoryQuery,
  MemoryRepository,
  RecallResult,
} from '../domain/repositories.interface';

export interface WriteMemoryInput {
  userId: string;
  kind: MemoryKind;
  content: string;
  metadata?: Record<string, unknown>;
  importanceScore?: number;
  sourceType?: string;
  sourceRef?: string | null;
  relatedEntities?: string[];
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @Inject(MEMORY_REPOSITORY)
    private readonly memory: MemoryRepository,
    private readonly embeddings: EmbeddingService,
  ) {}

  async write(input: WriteMemoryInput): Promise<MemoryRecord> {
    const embedding = await this.embeddings.embed(input.content);
    const record = MemoryRecord.create({
      ...input,
      embedding,
    });
    await this.memory.save(record);
    return record;
  }

  async recall(input: {
    userId: string;
    query: string;
    kinds?: MemoryKind[];
    topK?: number;
    relatedEntities?: string[];
  }): Promise<RecallResult[]> {
    const embedding = await this.embeddings.embed(input.query);
    const memoryQuery: MemoryQuery = {
      userId: input.userId,
      kinds: input.kinds,
      topK: input.topK,
      excludeSuperseded: true,
      relatedEntities: input.relatedEntities,
    };
    if (embedding) memoryQuery.embedding = embedding;
    else memoryQuery.searchText = input.query;

    const results = await this.memory.recall(memoryQuery);

    // Bump access counters for retrieved records (fire-and-forget).
    for (const result of results) {
      result.record.recordAccess();
      this.memory.save(result.record).catch((error) => {
        this.logger.warn(`Failed to bump access for ${result.record.id}: ${(error as Error).message}`);
      });
    }
    return results;
  }

  async writeEpisodic(
    userId: string,
    content: string,
    sourceType: string,
    sourceRef?: string,
    importance = 0.4,
  ): Promise<MemoryRecord> {
    return this.write({
      userId,
      kind: 'EPISODIC',
      content,
      sourceType,
      sourceRef,
      importanceScore: importance,
    });
  }

  async writeSemantic(
    userId: string,
    content: string,
    importance = 0.7,
    metadata?: Record<string, unknown>,
  ): Promise<MemoryRecord> {
    return this.write({
      userId,
      kind: 'SEMANTIC',
      content,
      metadata,
      importanceScore: importance,
    });
  }
}
