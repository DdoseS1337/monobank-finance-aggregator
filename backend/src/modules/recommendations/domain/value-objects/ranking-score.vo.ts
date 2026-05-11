/**
 * Multi-criteria ranking score for a recommendation candidate.
 *
 *   total = w_utility * utility
 *         + w_urgency * urgency
 *         + w_novelty * novelty
 *         + w_user_fit * user_fit
 *
 *   weights default: 0.4 / 0.3 / 0.15 / 0.15.
 *   The Personalization context can adjust weights per user (Phase 5.2).
 */
export interface RankingBreakdown {
  utility: number;   // 0..1 — expected financial benefit, normalized
  urgency: number;   // 0..1 — 1 / time_to_consequence, normalized
  novelty: number;   // 0..1 — 1 - max_similarity_to_recent
  userFit: number;   // 0..1 — embedding similarity to historically-accepted
}

export interface RankingWeights {
  utility: number;
  urgency: number;
  novelty: number;
  userFit: number;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  utility: 0.4,
  urgency: 0.3,
  novelty: 0.15,
  userFit: 0.15,
};

export class RankingScore {
  constructor(
    public readonly total: number,
    public readonly breakdown: RankingBreakdown,
    public readonly weights: RankingWeights,
  ) {
    if (total < 0 || total > 1) {
      throw new Error('Ranking total must be in [0, 1]');
    }
  }

  static compute(
    breakdown: RankingBreakdown,
    weights: RankingWeights = DEFAULT_WEIGHTS,
  ): RankingScore {
    const total =
      breakdown.utility * weights.utility +
      breakdown.urgency * weights.urgency +
      breakdown.novelty * weights.novelty +
      breakdown.userFit * weights.userFit;
    return new RankingScore(Math.max(0, Math.min(1, total)), breakdown, weights);
  }

  toJSON() {
    return {
      total: Number(this.total.toFixed(4)),
      breakdown: this.breakdown,
      weights: this.weights,
    };
  }
}
