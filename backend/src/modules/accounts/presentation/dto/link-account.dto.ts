import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class LinkAccountDto {
  @IsString()
  @IsNotEmpty()
  source: string;

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  externalAccountId: string;

  @IsString()
  @IsOptional()
  name?: string;
}
