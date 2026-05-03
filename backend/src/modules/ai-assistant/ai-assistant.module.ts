import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PatternsModule } from '../patterns/patterns.module';
import { InsightsModule } from '../insights/insights.module';
import { ForecastingModule } from '../forecasting/forecasting.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AiThreadRepository } from './infrastructure/ai-thread.repository';
import { ModelRegistry } from './infrastructure/model-registry';
import { ToolFactoryService } from './application/tool-factory.service';
import { ChatService } from './application/chat.service';
import { AiController } from './presentation/ai.controller';

@Module({
  imports: [
    AnalyticsModule,
    PatternsModule,
    InsightsModule,
    ForecastingModule,
    TransactionsModule,
  ],
  controllers: [AiController],
  providers: [
    AiThreadRepository,
    ModelRegistry,
    ToolFactoryService,
    ChatService,
  ],
})
export class AiAssistantModule {}
