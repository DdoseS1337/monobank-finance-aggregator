import { IsDateString, IsOptional, IsUUID, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class InsightsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  /** Z-score threshold for anomaly detection (default 2.5) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1.5)
  @Max(5)
  zScoreThreshold?: number;

  /** Minimum % growth to flag a category spike (default 50) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(500)
  spikeThresholdPct?: number;
}
