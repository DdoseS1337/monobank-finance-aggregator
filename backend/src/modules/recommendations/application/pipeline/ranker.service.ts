import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { EmbeddingService } from '../../../../shared-kernel/ai/embedding.service';
import { Recommendation } from '../../domain/recommendation.entity';
import {
  DEFAULT_WEIGHTS,
  RankingScore,
  RankingWeights,
} from '../../domain/value-objects/ranking-score.vo';
import { UserContext } from './context-builder.service';

const PRIORITY_TO_URGENCY: Record<number, number> = {
  1: 1.0,
  2: 0.75,
  3: 0.5,
  4: 0.25,
};

/**
 * Multi-criteria ranker.
 *
 *   utility   — normalized expected financial impact (cap at 10 000 ₴ → 1.0)
 *   urgency   — derived from priority + (optional) days-until-consequence
 *   novelty   — `1 - max_similarity` against the last 30 days of recommendations
 *               (computed up-stream by the deduplicator and passed in)
 *   user_fit  — embedding similarity against the centroid of accepted ones
 *               (passed in too)
 */
@Injectable()
export class RecommendationRanker {
  rank(
    rec: Recommendation,
    ctx: UserContext,
    inputs: {
      maxRecentSimilarity: number;
      userFitSimilarity: number;
      weights?: RankingWeights;
    },
  ): RankingScore {
    const utility = this.utility(rec, ctx);
    const urgency = this.urgency(rec);
    const novelty = Math.max(0, 1 - inputs.maxRecentSimilarity);
    const userFit = Math.max(0, Math.min(1, inputs.userFitSimilarity));
    return RankingScore.compute(
      { utility, urgency, novelty, userFit },
      inputs.weights ?? DEFAULT_WEIGHTS,
    );
  }

  private utility(rec: Recommendation, _ctx: UserContext): number {
    const impact = rec.expectedImpact?.financial?.amount;
    if (!impact) return 0.3;
    const numeric = Math.abs(Number(impact));
    if (Number.isNaN(numeric)) return 0.3;
    // Cap at 10000 to keep utility ∈ [0, 1].
    return Math.min(1, numeric / 10_000);
  }

  private urgency(rec: Recommendation): number {
    const priorityScore = PRIORITY_TO_URGENCY[rec.priority] ?? 0.4;
    const validUntil = rec.validUntil;
    if (!validUntil) return priorityScore;
    const days = Math.max(0, dayjs(validUntil).diff(dayjs(), 'day'));
    // The closer to expiration, the more urgent.
    const lifetimeScore = Math.max(0, Math.min(1, 1 - days / 30));
    return Math.min(1, 0.7 * priorityScore + 0.3 * lifetimeScore);
  }
}

export { EmbeddingService };
