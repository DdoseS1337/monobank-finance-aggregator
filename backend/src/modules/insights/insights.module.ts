import { Module } from '@nestjs/common';
import { InsightsRepository } from './infrastructure/insights.repository';
import { InsightsService } from './application/insights.service';
import { InsightsController } from './presentation/insights.controller';

@Module({
  controllers: [InsightsController],
  providers: [InsightsRepository, InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
