import { Module } from '@nestjs/common';
import { ForecastingRepository } from './infrastructure/forecasting.repository';
import { ForecastingService } from './application/forecasting.service';
import { ForecastingController } from './presentation/forecasting.controller';

@Module({
  controllers: [ForecastingController],
  providers: [ForecastingRepository, ForecastingService],
  exports: [ForecastingService],
})
export class ForecastingModule {}
