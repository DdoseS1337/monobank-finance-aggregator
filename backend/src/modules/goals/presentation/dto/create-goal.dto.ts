import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

const TYPES = ['SAVING', 'DEBT_PAYOFF', 'INVESTMENT', 'PURCHASE'] as const;
const STRATEGIES = ['FIXED_MONTHLY', 'PERCENTAGE_INCOME', 'SURPLUS'] as const;
const CURRENCIES = ['UAH', 'USD', 'EUR', 'GBP', 'PLN'] as const;

export class CreateGoalDto {
  @IsIn(TYPES as unknown as string[])
  type!: (typeof TYPES)[number];

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsNumberString()
  targetAmount!: string;

  @IsIn(CURRENCIES as unknown as string[])
  baseCurrency!: (typeof CURRENCIES)[number];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @IsOptional()
  @IsIn(STRATEGIES as unknown as string[])
  fundingStrategy?: (typeof STRATEGIES)[number];

  @IsOptional()
  @IsObject()
  fundingParams?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  linkedAccountId?: string;
}

export class ContributeDto {
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsIn(['MANUAL', 'RULE', 'TRANSACTION_LINK', 'SURPLUS_AUTO'])
  sourceType?: 'MANUAL' | 'RULE' | 'TRANSACTION_LINK' | 'SURPLUS_AUTO';

  @IsOptional()
  @IsString()
  sourceRef?: string;
}

export class AdjustTargetDto {
  @IsNumberString()
  newTarget!: string;
}

export class AdjustDeadlineDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  newDeadline?: Date | null;
}

export class AdjustPriorityDto {
  @IsInt()
  @Min(1)
  @Max(5)
  priority!: number;
}

export class AbandonDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}
