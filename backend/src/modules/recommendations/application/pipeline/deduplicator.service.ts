import { Inject, Injectable } from '@nestjs/common';
import { EmbeddingService } from '../../../../shared-kernel/ai/embedding.service';
import { Recommendation } from '../../domain/recommendation.entity';
import {
  RECOMMENDATION_REPOSITORY,
  RecommendationRepository,
} from '../../domain/repositories.interface';

const SIMILARITY_THRESHOLD = 0.92;
const RECENT_WINDOW_DAYS = 30;

export interface DedupOutcome {
  /** Recommendations that should NOT be persisted. */
  skipped: Recommendation[];
  /** Recommendations to keep, with their max-similarity hint for ranker. */
  kept: Array<{ recommendation: Recommendation; maxSimilarity: number }>;
}

/**
 * Two-pass dedup:
 *
 *   1. Intra-batch: drop candidates that are mutually similar (similarity ≥ threshold);
 *      keep the highest-priority one.
 *   2. Cross-history: drop candidates similar to a recommendation generated
 *      in the last 30 days that the user already rejected/snoozed (anti-spam).
 *      Similar items where the user *accepted* before are kept (positive signal).
 *
 * The remaining candidates' max-similarity is passed downstream for the
 * novelty score in the ranker.
 */
@Injectable()
export class Deduplicator {
  constructor(
    @Inject(RECOMMENDATION_REPOSITORY)
    private readonly recommendations: RecommendationRepository,
  ) {}

  async dedup(userId: string, candidates: Recommendation[]): Promise<DedupOutcome> {
    if (candidates.length === 0) return { skipped: [], kept: [] };

    // Intra-batch pass: index by (kind + payload-key signature).
    const seenSignatures = new Map<string, Recommendation>();
    const intraSurvivors: Recommendation[] = [];
    for (const candidate of candidates) {
      const sig = this.signature(candidate);
      const prior = seenSignatures.get(sig);
      if (prior) {
        // keep the one with higher priority
        if (candidate.priority < prior.priority) {
          seenSignatures.set(sig, candidate);
          intraSurvivors[intraSurvivors.indexOf(prior)] = candidate;
        }
      } else {
        seenSignatures.set(sig, candidate);
        intraSurvivors.push(candidate);
      }
    }

    const skipped = candidates.filter((c) => !intraSurvivors.includes(c));
    const kept: DedupOutcome['kept'] = [];

    for (const survivor of intraSurvivors) {
      let maxSim = 0;
      let blocked = false;
      if (survivor.embedding) {
        const recent = await this.recommendations.findSimilarRecent(
          userId,
          survivor.embedding,
          RECENT_WINDOW_DAYS,
          5,
        );
        for (const sim of recent) {
          if (sim.similarity >= SIMILARITY_THRESHOLD && sim.kind === survivor.kind) {
            // Block if the user previously REJECTED or SNOOZED a near-twin.
            if (sim.status === 'REJECTED' || sim.status === 'SNOOZED' || sim.status === 'EXPIRED') {
              blocked = true;
              break;
            }
          }
          if (sim.similarity > maxSim) maxSim = sim.similarity;
        }
      }
      if (blocked) {
        skipped.push(survivor);
      } else {
        kept.push({ recommendation: survivor, maxSimilarity: maxSim });
      }
    }

    return { skipped, kept };
  }

  /**
   * Stable signature combining kind + the most identifying payload fields.
   * Used as cheap intra-batch dedup key without hitting embeddings.
   */
  private signature(rec: Recommendation): string {
    const payload = rec.payload;
    const keys = ['budgetId', 'lineId', 'goalId', 'subscriptionId', 'reason', 'predictedFor'];
    const parts = keys
      .filter((k) => k in payload)
      .map((k) => `${k}=${String((payload as Record<string, unknown>)[k] ?? '')}`);
    return `${rec.kind}|${parts.join('|') || rec.explanation.slice(0, 64)}`;
  }
}

export { EmbeddingService };
