import {
  IsUUID,
  IsNumber,
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsInt,
} from 'class-validator';

export class ManualTransactionDto {
  @IsUUID()
  accountId: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  transactionTime: string;

  @IsInt()
  @IsOptional()
  mcc?: number;

  @IsString()
  @IsOptional()
  merchantName?: string;

  @IsString()
  @IsOptional()
  category?: string;
}
