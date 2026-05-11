import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ListTransactionsQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').filter(Boolean)
      : Array.isArray(value)
        ? value
        : undefined,
  )
  @IsArray()
  @IsUUID('4', { each: true })
  accountIds?: string[];

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').filter(Boolean)
      : Array.isArray(value)
        ? value
        : undefined,
  )
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsIn(['DEBIT', 'CREDIT', 'TRANSFER', 'HOLD'])
  type?: 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'HOLD';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isAnomaly?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class RecategorizeDto {
  @IsUUID()
  newCategoryId!: string;
}

export class LinkMonobankDto {
  @IsString()
  @Length(10, 256)
  token!: string;
}

export class ImportTransactionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1825)
  sinceDays?: number;
}

export class SpendingSummaryQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class SpendingDecompositionQueryDto {
  @Type(() => Date)
  @IsDate()
  fromA!: Date;

  @Type(() => Date)
  @IsDate()
  toA!: Date;

  @Type(() => Date)
  @IsDate()
  fromB!: Date;

  @Type(() => Date)
  @IsDate()
  toB!: Date;

  @IsOptional()
  @IsIn(['merchant', 'category'])
  groupBy?: 'merchant' | 'category';
}
