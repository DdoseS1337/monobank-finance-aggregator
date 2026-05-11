import { Inject, Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { LlmService } from '../../../../shared-kernel/ai/llm.service';
import { EmbeddingService } from '../../../../shared-kernel/ai/embedding.service';
import { DomainEventBus } from '../../../../shared-kernel/events/domain-event-bus';
import { MemoryRecord } from '../domain/memory-record.entity';
import {
  MEMORY_REPOSITORY,
  MemoryRepository,
} from '../domain/repositories.interface';
import { MemoryConsolidated } from '../domain/events/memory-events';

const CONSOLIDATION_LOOKBACK_DAYS = 7;
const MAX_EPISODIC_INPUT = 100;
const MIN_FACTS_TO_PROMOTE = 1;

const SYSTEM_PROMPT = `You are a memory-consolidation agent for a personal-finance assistant.
Given recent EPISODIC memories about a single user, identify durable SEMANTIC facts
(preferences, behavior patterns, constraints) that future agents should know about.

Rules:
- ONLY produce facts that are stable across multiple episodes (not one-off events).
- Each fact must be a single self-contained sentence in English.
- Output JSON: { "semantic_facts": [{ "content": string, "importance": number 0..1 }] }.
- If nothing stable emerges, output { "semantic_facts": [] }.`;

const REFLECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    semantic_facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          content: { type: 'string', minLength: 5, maxLength: 500 },
          importance: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['content', 'importance'],
      },
    },
  },
  required: ['semantic_facts'],
};

interface ReflectionOutput {
  semantic_facts: Array<{ content: string; importance: number }>;
}

/**
 * Reflection-style consolidation:
 *
 *   Take last N days of EPISODIC memories → ask the LLM what stable
 *   patterns emerge → promote those patterns to SEMANTIC memories.
 *
 * Failure modes:
 *   - LLM unavailable → service returns 0 (no-op).
 *   - LLM returns malformed JSON → discarded; we keep episodic intact.
 */
@Injectable()
export class MemoryConsolidationService {
  private readonly logger = new Logger(MemoryConsolidationService.name);

  constructor(
    @Inject(MEMORY_REPOSITORY)
    private readonly memory: MemoryRepository,
    private readonly llm: LlmService,
    private readonly embeddings: EmbeddingService,
    private readonly events: DomainEventBus,
  ) {}

  async consolidateForUser(userId: string): Promise<{
    semanticAdded: number;
    episodicCompressed: number;
    proceduralAdded: number;
  }> {
    if (!this.llm.isAvailable()) {
      this.logger.debug(`LLM unavailable; skipping consolidation for ${userId}`);
      return { semanticAdded: 0, episodicCompressed: 0, proceduralAdded: 0 };
    }

    const cutoff = dayjs().subtract(CONSOLIDATION_LOOKBACK_DAYS, 'day').toDate();
    const episodes = await this.memory.episodicSince(userId, cutoff, MAX_EPISODIC_INPUT);
    if (episodes.length === 0) {
      return { semanticAdded: 0, episodicCompressed: 0, proceduralAdded: 0 };
    }

    const userPrompt = this.composePrompt(episodes);
    const completion = await this.llm.complete({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      jsonSchema: { name: 'reflection_schema', schema: REFLECTION_SCHEMA },
      temperature: 0.3,
      cheap: true,
    });
    if (!completion?.json) return { semanticAdded: 0, episodicCompressed: 0, proceduralAdded: 0 };

    const reflection = completion.json as ReflectionOutput;
    if (!reflection?.semantic_facts || reflection.semantic_facts.length < MIN_FACTS_TO_PROMOTE) {
      return { semanticAdded: 0, episodicCompressed: 0, proceduralAdded: 0 };
    }

    let semanticAdded = 0;
    for (const fact of reflection.semantic_facts) {
      const embedding = await this.embeddings.embed(fact.content);
      const record = MemoryRecord.create({
        userId,
        kind: 'SEMANTIC',
        content: fact.content.trim(),
        embedding,
        importanceScore: Math.max(0, Math.min(1, fact.importance)),
        sourceType: 'consolidation',
        relatedEntities: ['consolidated_from_episodic'],
      });
      await this.memory.save(record);
      semanticAdded++;
    }

    await this.events.publish(
      new MemoryConsolidated(
        userId,
        {
          userId,
          semanticAdded,
          episodicCompressed: 0,
          proceduralAdded: 0,
        },
        { userId },
      ),
    );

    this.logger.log(
      `Consolidated user ${userId}: ${semanticAdded} new semantic facts (from ${episodes.length} episodes)`,
    );
    return { semanticAdded, episodicCompressed: 0, proceduralAdded: 0 };
  }

  private composePrompt(records: MemoryRecord[]): string {
    const lines = records
      .slice(0, MAX_EPISODIC_INPUT)
      .map((r, i) => `[${i + 1}] ${r.content}`);
    return [
      `Recent episodic memories (${records.length}):`,
      ...lines,
      '',
      'Identify stable patterns and emit semantic facts as JSON per the schema.',
    ].join('\n');
  }
}
