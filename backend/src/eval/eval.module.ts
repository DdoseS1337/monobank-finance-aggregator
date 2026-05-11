import { Module } from '@nestjs/common';
import { CashflowModule } from '../modules/cashflow/cashflow.module';
import { RecommendationsModule } from '../modules/recommendations/recommendations.module';
import { ForecastEvaluator } from './forecast-evaluator';
import { ToolSuccessReport } from './tool-success-rate';
import { RecommendationAcceptanceSimulator } from './recommendation-acceptance';

@Module({
  imports: [CashflowModule, RecommendationsModule],
  providers: [
    ForecastEvaluator,
    ToolSuccessReport,
    RecommendationAcceptanceSimulator,
  ],
  exports: [
    ForecastEvaluator,
    ToolSuccessReport,
    RecommendationAcceptanceSimulator,
  ],
})
export class EvalModule {}
