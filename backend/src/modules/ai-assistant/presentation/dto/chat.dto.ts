import { IsIn, IsOptional, IsString, IsUUID, IsArray } from 'class-validator';

const MODELS = [
  'gpt-5',
  'gpt-4.1-mini',
  'claude-opus-4-7',
  'claude-sonnet-4-6',
];

export class ChatRequestDto {
  @IsUUID()
  threadId!: string;

  @IsOptional()
  @IsIn(MODELS)
  model?: string;

  // Accept AI SDK UIMessage[] — shape is validated by AI SDK runtime
  @IsArray()
  messages!: unknown[];
}

export class CreateThreadDto {
  @IsOptional()
  @IsIn(MODELS)
  model?: string;
}

export class UpdateThreadDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(MODELS)
  model?: string;
}
