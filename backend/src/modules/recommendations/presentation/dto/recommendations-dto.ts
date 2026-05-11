import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

const STATUSES = ['PENDING', 'DELIVERED', 'ACCEPTED', 'REJECTED', 'MODIFIED', 'SNOOZED', 'EXPIRED'] as const;
const KINDS = ['SPENDING', 'SAVING', 'SUBSCRIPTION', 'BUDGET', 'GOAL', 'CASHFLOW', 'BEHAVIORAL'] as const;

export class ListRecommendationsQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').filter(Boolean)
      : Array.isArray(value)
        ? value
        : undefined,
  )
  @IsArray()
  @IsIn(STATUSES as unknown as string[], { each: true })
  status?: (typeof STATUSES)[number][];

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').filter(Boolean)
      : Array.isArray(value)
        ? value
        : undefined,
  )
  @IsArray()
  @IsIn(KINDS as unknown as string[], { each: true })
  kinds?: (typeof KINDS)[number][];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  validOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class FeedbackDto {
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  feedbackText?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  snoozeHours?: number;
}
