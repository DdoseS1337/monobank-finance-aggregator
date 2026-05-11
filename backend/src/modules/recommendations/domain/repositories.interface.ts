import { Recommendation, RecommendationKind, RecommendationStatus } from './recommendation.entity';

export const RECOMMENDATION_REPOSITORY = Symbol('RecommendationRepository');

export interface ListRecommendationFilter {
  userId: string;
  status?: RecommendationStatus[];
  kinds?: RecommendationKind[];
  validOnly?: boolean;
  limit?: number;
}

export interface RecommendationRepository {
  save(recommendation: Recommendation): Promise<void>;
  findById(id: string): Promise<Recommendation | null>;
  list(filter: ListRecommendationFilter): Promise<Recommendation[]>;
  expireStale(): Promise<number>;

  /** Find similar past recommendations via cosine distance for dedup. */
  findSimilarRecent(
    userId: string,
    embedding: Float32Array,
    sinceDays: number,
    limit: number,
  ): Promise<Array<{ id: string; status: RecommendationStatus; similarity: number; kind: string }>>;

  /** Centroid of accepted recommendations' embeddings — used as user-fit reference. */
  acceptedCentroid(userId: string): Promise<Float32Array | null>;

  recordFeedback(input: {
    recommendationId: string;
    userId: string;
    decision: RecommendationStatus;
    feedbackText?: string | null;
    modifications?: Record<string, unknown>;
  }): Promise<void>;
}
