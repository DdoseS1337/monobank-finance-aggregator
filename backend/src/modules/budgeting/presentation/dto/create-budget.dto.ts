import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const METHODS = ['CATEGORY', 'ENVELOPE', 'ZERO_BASED', 'PAY_YOURSELF_FIRST'] as const;
const CADENCES = ['WEEKLY', 'MONTHLY', 'CUSTOM'] as const;
const ROLLOVER = ['CARRY_OVER', 'RESET', 'PARTIAL'] as const;
const CURRENCIES = ['UAH', 'USD', 'EUR', 'GBP', 'PLN'] as const;

export class CreateBudgetLineDto {
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

export class CreateBudgetDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  name!: string;

  @IsIn(METHODS as unknown as string[])
  method!: (typeof METHODS)[number];

  @IsIn(CADENCES as unknown as string[])
  cadence!: (typeof CADENCES)[number];

  @IsIn(CURRENCIES as unknown as string[])
  baseCurrency!: (typeof CURRENCIES)[number];

  @IsOptional()
  @IsIn(ROLLOVER as unknown as string[])
  rolloverPolicy?: (typeof ROLLOVER)[number];

  @IsOptional()
  @IsBoolean()
  startNow?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateBudgetLineDto)
  initialLines?: CreateBudgetLineDto[];
}
