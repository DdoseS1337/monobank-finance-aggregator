import { IsDateString, IsString } from 'class-validator';

export class SyncTransactionsDto {
  @IsString()
  source: string;

  @IsString()
  token: string;

  @IsString()
  accountId: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
