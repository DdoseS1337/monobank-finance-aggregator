import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainEventBus } from '../../../../shared-kernel/events/domain-event-bus';
import { EmbeddingService } from '../../../../shared-kernel/ai/embedding.service';
import { Recommendation } from '../../domain/recommendation.entity';
import {
  RECOMMENDATION_REPOSITORY,
  RecommendationRepository,
} from '../../domain/repositories.interface';
import { RecommendationGenerated } from '../../domain/events/recommendation-events';
import { ContextBuilderService } from './context-builder.service';
import { RuleBasedGenerator } from './generators/rule-based-generator';
import { LlmGenerator } from './generators/llm-generator';
import { RecommendationRanker } from './ranker.service';
import { Deduplicator } from './deduplicator.service';

const TOP_N_PER_RUN = 6;

export interface PipelineRunResult {
  generated: number;
  skipped: number;
  persisted: number;
  byGenerator: Record<string, number>;
}

/**
 * Orchestrates a full recommendation cycle for a single user:
 *
 *   ContextBuilder → Generators (parallel) → Aggregator → Embedding pass
 *                  → Deduplicator → Ranker → Top-N filter → Persist + emit
 *
 * Designed to be called both from cron (hourly) and from event-driven
 * triggers (e.g. cashflow.deficit.predicted) — same code path.
 */
@Injectable()
export class RecommendationPipeline {
  private readonly logger = new Logger(RecommendationPipeline.name);

  constructor(
    private readonly contextBuilder: ContextBuilderService,
    private readonly ruleGenerator: RuleBasedGenerator,
    private readonly llmGenerator: LlmGenerator,
    private readonly ranker: RecommendationRanker,
    private readonly dedup: Deduplicator,
    private readonly embeddings: EmbeddingService,
    private readonly events: DomainEventBus,
    @Inject(RECOMMENDATION_REPOSITORY)
    private readonly repo: RecommendationRepository,
  ) {}

  async run(userId: string): Promise<PipelineRunResult> {
    const start = Date.now();
    const ctx = await this.contextBuilder.build(userId);

    const [ruleCandidates, llmCandidates] = await Promise.all([
      this.ruleGenerator.generate(ctx).catch((err) => {
        this.logger.error('Rule generator failed', err as Error);
        return [] as Recommendation[];
      }),
      this.llmGenerator.generate(ctx).catch((err) => {
        this.logger.error('LLM generator failed', err as Error);
        return [] as Recommendation[];
      }),
    ]);
    const candidates = [...ruleCandidates, ...llmCandidates];
    if (candidates.length === 0) {
      return { generated: 0, skipped: 0, persisted: 0, byGenerator: {} };
    }

    // Compute embeddings for all candidates in one batch.
    if (this.embeddings.isAvailable()) {
      const texts = candidates.map((c) => c.explanation);
      const vectors = await this.embeddings.embedBatch(texts);
      candidates.forEach((c, i) => {
        const v = vectors[i];
        if (v) (c as unknown as { props: { embedding: Float32Array } }).props.embedding = v;
      });
    }

    const dedupOutcome = await this.dedup.dedup(userId, candidates);
    if (dedupOutcome.kept.length === 0) {
      this.logger.log(`User ${userId}: ${candidates.length} candidates, all dedup-rejected`);
      return {
        generated: candidates.length,
        skipped: dedupOutcome.skipped.length,
        persisted: 0,
        byGenerator: this.countByGenerator(candidates),
      };
    }

    const centroid = this.embeddings.isAvailable()
      ? await this.repo.acceptedCentroid(userId)
      : null;

    const ranked = dedupOutcome.kept.map(({ recommendation, maxSimilarity }) => {
      const userFitSimilarity = recommendation.embedding && centroid
        ? EmbeddingService.similarity(recommendation.embedding, centroid)
        : 0.5;
      const score = this.ranker.rank(recommendation, ctx, {
        maxRecentSimilarity: maxSimilarity,
        userFitSimilarity,
      });
      recommendation.setRanking(score);
      return recommendation;
    });

    ranked.sort((a, b) => (b.ranking?.total ?? 0) - (a.ranking?.total ?? 0));
    const winners = ranked.slice(0, TOP_N_PER_RUN);

    let persisted = 0;
    for (const rec of winners) {
      await this.repo.save(rec);
      await this.events.publish(
        new RecommendationGenerated(
          rec.id,
          {
            recommendationId: rec.id,
            userId,
            kind: rec.kind,
            generatedBy: rec.generatedBy,
            rankingScore: rec.ranking?.total ?? 0,
            validUntil: rec.validUntil?.toISOString() ?? null,
          },
          { userId },
        ),
      );
      persisted++;
    }

    this.logger.log(
      `User ${userId}: ${candidates.length} candidates → ${winners.length} persisted ` +
        `in ${Date.now() - start}ms (${this.summary(winners)})`,
    );

    return {
      generated: candidates.length,
      skipped: dedupOutcome.skipped.length + (ranked.length - winners.length),
      persisted,
      byGenerator: this.countByGenerator(winners),
    };
  }

  private summary(items: Recommendation[]): string {
    return items
      .map((i) => `${i.kind}:p${i.priority}:s${(i.ranking?.total ?? 0).toFixed(2)}`)
      .join(', ');
  }

  private countByGenerator(items: Recommendation[]): Record<string, number> {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.generatedBy] = (acc[item.generatedBy] ?? 0) + 1;
      return acc;
    }, {});
  }
}
