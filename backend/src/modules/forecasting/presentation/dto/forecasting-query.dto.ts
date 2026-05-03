import { IsIn, IsInt, IsOptional, IsUUID, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ForecastModel } from '../../domain/forecast.interfaces';

const ALL_MODELS: ForecastModel[] = [
  'moving_average',
  'linear_trend',
  'seasonal_naive',
  'exponential_smoothing',
  'ensemble',
];

export class ForecastingQueryDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  /** Horizon in days (7..90, default 30) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  horizonDays?: number;

  /** Forecasting model */
  @IsOptional()
  @IsIn(ALL_MODELS)
  model?: ForecastModel;

  /** How many days of history to look back (30..365, default 180) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(14)
  @Max(730)
  lookbackDays?: number;
}
