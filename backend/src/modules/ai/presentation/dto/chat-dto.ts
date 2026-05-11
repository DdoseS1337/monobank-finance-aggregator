import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ChatDto {
  @IsString()
  @Length(1, 4000)
  message!: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
