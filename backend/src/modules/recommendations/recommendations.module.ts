import { Module } from '@nestjs/common';
import { RecommendationsController } from './presentation/recommendations.controller';
import { RecommendationsService } from './application/recommendations.service';
import { RecommendationsSaga } from './application/recommendations.saga';
import { RecommendationsScheduler } from './application/recommendations.scheduler';
import { RecommendationPipeline } from './application/pipeline/pipeline.service';
import { ContextBuilderService } from './application/pipeline/context-builder.service';
import { RuleBasedGenerator } from './application/pipeline/generators/rule-based-generator';
import { LlmGenerator } from './application/pipeline/generators/llm-generator';
import { RecommendationRanker } from './application/pipeline/ranker.service';
import { Deduplicator } from './application/pipeline/deduplicator.service';
import { PrismaRecommendationRepository } from './infrastructure/recommendation.repository';
import { RECOMMENDATION_REPOSITORY } from './domain/repositories.interface';
import { MemoryModule } from '../ai/memory/memory.module';

/**
 * Recommendation Context — Phase 4.3.
 *
 * Hybrid pipeline: rule-based + LLM generators → embeddings → dedup → MCDM
 * ranker → top-N persist + emit recommendation.generated.
 *
 * Imports AiModule for MemoryService access (LLM generator pulls semantic
 * memories into the prompt; saga writes feedback as episodic memories).
 */
@Module({
  imports: [MemoryModule],
  controllers: [RecommendationsController],
  providers: [
    RecommendationsService,
    RecommendationsSaga,
    RecommendationsScheduler,
    RecommendationPipeline,
    ContextBuilderService,
    RuleBasedGenerator,
    LlmGenerator,
    RecommendationRanker,
    Deduplicator,
    { provide: RECOMMENDATION_REPOSITORY, useClass: PrismaRecommendationRepository },
  ],
  exports: [RecommendationsService, RecommendationPipeline],
})
export class RecommendationsModule {}
