import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class IncomeVsExpenseQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month';
}

export class PeriodComparisonQueryDto {
  @IsDateString()
  period1From: string;

  @IsDateString()
  period1To: string;

  @IsDateString()
  period2From: string;

  @IsDateString()
  period2To: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;
}
