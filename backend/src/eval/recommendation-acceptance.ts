import { Inject, Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../shared-kernel/prisma/prisma.service';
import { RecommendationPipeline } from '../modules/recommendations/application/pipeline/pipeline.service';
import {
  RECOMMENDATION_REPOSITORY,
  RecommendationRepository,
} from '../modules/recommendations/domain/repositories.interface';
import type { Recommendation, RecommendationKind } from '../modules/recommendations/domain/recommendation.entity';

export interface AcceptanceProfile {
  /** Probability the synthetic user accepts a recommendation of this kind. */
  perKind: Partial<Record<RecommendationKind, number>>;
  /** Default probability for kinds not listed above. */
  defaultProb: number;
}

export interface AcceptanceSimResult {
  userId: string;
  generated: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number;
  /** Cohort-level NDCG@K for the ranker.
   *  We treat "accepted=1, rejected=0" as relevance and use the rank
   *  produced by the MCDM scorer.
   */
  ndcgAt5: number;
  /** Mean ranking score of accepted items vs rejected — sanity check
   *  that the ranker correlates with synthetic preferences. */
  meanScoreAccepted: number;
  meanScoreRejected: number;
}

/**
 * Runs the recommendation pipeline once for `userId`, then simulates user
 * decisions according to `profile` and computes acceptance rate + NDCG.
 *
 * Use this for offline calibration of the ranker weights — change the
 * weights, re-run the simulator, watch NDCG move.
 *
 * Caveat: synthetic acceptance does NOT capture "novelty" preferences —
 * NDCG here measures whether MCDM ranks aligned with kind-based prefs.
 * For a richer signal, swap `AcceptanceProfile` for a real labelled set.
 */
@Injectable()
export class RecommendationAcceptanceSimulator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: RecommendationPipeline,
    @Inject(RECOMMENDATION_REPOSITORY)
    private readonly repo: RecommendationRepository,
  ) {}

  async simulate(userId: string, profile: AcceptanceProfile): Promise<AcceptanceSimResult> {
    // Snapshot recommendations BEFORE the pipeline run so we can isolate
    // the items it generated.
    const before = await this.recentIds(userId);
    await this.pipeline.run(userId);
    const after = await this.recentIds(userId);

    const newIds = after.filter((id) => !before.includes(id));
    const newRecs: Recommendation[] = [];
    for (const id of newIds) {
      const r = await this.repo.findById(id);
      if (r) newRecs.push(r);
    }
    if (newRecs.length === 0) {
      return zeroResult(userId);
    }

    const decisions = newRecs.map((r) => {
      const prob = profile.perKind[r.kind] ?? profile.defaultProb;
      const accepted = Math.random() < prob;
      return { rec: r, accepted };
    });

    const accepted = decisions.filter((d) => d.accepted);
    const rejected = decisions.filter((d) => !d.accepted);
    const acceptanceRate = accepted.length / decisions.length;

    const meanScore = (recs: Recommendation[]) =>
      recs.length === 0
        ? 0
        : recs.reduce((s, r) => s + (r.ranking?.total ?? 0), 0) / recs.length;

    // Treat ranking score as the pipeline's predicted relevance.
    // NDCG@K with binary relevance:
    //   DCG = Σ rel_i / log2(i + 2)
    //   IDCG = best possible ordering of relevances
    const k = Math.min(5, decisions.length);
    const sorted = [...decisions].sort(
      (a, b) => (b.rec.ranking?.total ?? 0) - (a.rec.ranking?.total ?? 0),
    );
    const dcg = sorted
      .slice(0, k)
      .reduce(
        (acc, d, i) => acc + (d.accepted ? 1 : 0) / Math.log2(i + 2),
        0,
      );
    const idealOrder = [...decisions].sort(
      (a, b) => Number(b.accepted) - Number(a.accepted),
    );
    const idcg = idealOrder
      .slice(0, k)
      .reduce(
        (acc, d, i) => acc + (d.accepted ? 1 : 0) / Math.log2(i + 2),
        0,
      );
    const ndcg = idcg === 0 ? 0 : dcg / idcg;

    return {
      userId,
      generated: decisions.length,
      accepted: accepted.length,
      rejected: rejected.length,
      acceptanceRate,
      ndcgAt5: ndcg,
      meanScoreAccepted: meanScore(accepted.map((d) => d.rec)),
      meanScoreRejected: meanScore(rejected.map((d) => d.rec)),
    };
  }

  private async recentIds(userId: string): Promise<string[]> {
    const since = dayjs().subtract(1, 'day').toDate();
    const rows = await this.prisma.recommendation.findMany({
      where: { userId, generatedAt: { gte: since } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

function zeroResult(userId: string): AcceptanceSimResult {
  return {
    userId,
    generated: 0,
    accepted: 0,
    rejected: 0,
    acceptanceRate: 0,
    ndcgAt5: 0,
    meanScoreAccepted: 0,
    meanScoreRejected: 0,
  };
}
