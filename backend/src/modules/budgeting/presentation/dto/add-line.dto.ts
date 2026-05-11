import { IsInt, IsNumberString, IsOptional, IsString, Max, Min } from 'class-validator';

export class AddBudgetLineDto {
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsNumberString()
  plannedAmount!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  thresholdPct?: number;
}

export class AdjustBudgetLineDto {
  @IsNumberString()
  newPlannedAmount!: string;
}
