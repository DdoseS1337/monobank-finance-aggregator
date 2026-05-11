import { Module } from '@nestjs/common';
import { CashflowModule } from '../modules/cashflow/cashflow.module';
import { RecommendationsModule } from '../modules/recommendations/recommendations.module';
import { RECOMMENDATION_REPOSITORY } from '../modules/recommendations/domain/repositories.interface';
import { PrismaRecommendationRepository } from '../modules/recommendations/infrastructure/recommendation.repository';
import { ForecastEvaluator } from './forecast-evaluator';
import { ToolSuccessReport } from './tool-success-rate';
import { RecommendationAcceptanceSimulator } from './recommendation-acceptance';

// RecommendationsModule does not export RECOMMENDATION_REPOSITORY, so we
// re-provide it locally for the simulator. Stateless repository → safe to
// duplicate; keeps the wiring fix isolated to eval-harness.
@Module({
  imports: [CashflowModule, RecommendationsModule],
  providers: [
    ForecastEvaluator,
    ToolSuccessReport,
    RecommendationAcceptanceSimulator,
    { provide: RECOMMENDATION_REPOSITORY, useClass: PrismaRecommendationRepository },
  ],
  exports: [
    ForecastEvaluator,
    ToolSuccessReport,
    RecommendationAcceptanceSimulator,
  ],
})
export class EvalModule {}
