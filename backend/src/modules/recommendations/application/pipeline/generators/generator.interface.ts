import { Recommendation } from '../../../domain/recommendation.entity';
import { UserContext } from '../context-builder.service';

/**
 * Generators emit *candidate* recommendations. The pipeline aggregator
 * deduplicates and ranks them before persisting, so individual generators
 * can be aggressive without polluting the inbox.
 */
export interface RecommendationGenerator {
  readonly name: string;
  generate(ctx: UserContext): Promise<Recommendation[]>;
}
