import { Module } from '@nestjs/common';
import { CashflowController } from './presentation/cashflow.controller';
import { ScenariosController } from './presentation/scenarios.controller';
import { CashflowService } from './application/cashflow.service';
import { ScenariosService } from './application/scenarios.service';
import { ForecastPipeline } from './application/forecasting/forecast-pipeline.service';
import { RecurringDetector } from './application/forecasting/recurring-detector.service';
import { HistoricalBaselineService } from './application/forecasting/historical-baseline.service';
import { MonteCarloSimulator } from './application/forecasting/monte-carlo-simulator.service';
import { ScenarioSimulator } from './application/simulation/scenario-simulator.service';
import { DeficitDetectorService } from './application/deficit-detector.service';
import { CashflowRefreshScheduler } from './application/cashflow-refresh.scheduler';
import { PrismaProjectionRepository } from './infrastructure/projection.repository';
import { PrismaScenarioRepository } from './infrastructure/scenario.repository';
import {
  PROJECTION_REPOSITORY,
  SCENARIO_REPOSITORY,
} from './domain/repositories.interface';
import { GoalsModule } from '../goals/goals.module';

/**
 * Cashflow & Forecasting Context — Phase 3.
 *
 * The CashflowRefreshScheduler is a @Cron-decorated provider; it only fires
 * when ScheduleModule is bootstrapped, which currently happens in both API
 * and Workers. We rely on a single worker replica to avoid double-execution.
 */
@Module({
  imports: [GoalsModule],
  controllers: [CashflowController, ScenariosController],
  providers: [
    CashflowService,
    ScenariosService,
    ForecastPipeline,
    RecurringDetector,
    HistoricalBaselineService,
    MonteCarloSimulator,
    ScenarioSimulator,
    DeficitDetectorService,
    CashflowRefreshScheduler,
    { provide: PROJECTION_REPOSITORY, useClass: PrismaProjectionRepository },
    { provide: SCENARIO_REPOSITORY, useClass: PrismaScenarioRepository },
  ],
  exports: [
    CashflowService,
    ScenariosService,
    ForecastPipeline,
    DeficitDetectorService,
  ],
})
export class CashflowModule {}
