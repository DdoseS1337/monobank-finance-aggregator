import { Module } from '@nestjs/common';
import { AnalyticsRepository } from './infrastructure/analytics.repository';
import { AnalyticsQueryService } from './application/analytics-query.service';
import { AnalyticsController } from './presentation/analytics.controller';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsRepository, AnalyticsQueryService],
  exports: [AnalyticsQueryService],
})
export class AnalyticsModule {}
