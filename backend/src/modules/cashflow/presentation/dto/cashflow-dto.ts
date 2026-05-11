import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class RefreshForecastDto {
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(180)
  horizonDays?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(5000)
  trials?: number;

  @IsOptional()
  @IsInt()
  seed?: number;
}

export class CreateScenarioDto {
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsArray()
  @Type(() => Object)
  variables!: Array<
    | { kind: 'INCOME_DELTA'; deltaMonthly: number; reason?: string }
    | { kind: 'CATEGORY_DELTA'; categorySlug: string; deltaPct: number }
    | { kind: 'NEW_GOAL'; targetAmount: number; deadline: string; monthlyContribution: number; name: string }
    | { kind: 'NEW_RECURRING'; amountMonthly: number; sign: 'INFLOW' | 'OUTFLOW'; description: string }
  >;

  @IsOptional()
  @IsString()
  baselineProjectionId?: string;

  @IsOptional()
  @IsIn([true, false])
  runNow?: boolean;
}
