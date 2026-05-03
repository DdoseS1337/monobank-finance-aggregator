import { Injectable, BadRequestException } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ConfigService } from '@nestjs/config';
import type { LanguageModel } from 'ai';
import type { AiModelId } from '../domain/ai.interfaces';

export interface ModelMeta {
  id: AiModelId;
  label: string;
  provider: 'openai' | 'anthropic';
  description: string;
}

export const AVAILABLE_MODELS: ModelMeta[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: 'Збалансована — швидка й якісна (за замовчуванням)',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    provider: 'anthropic',
    description: 'Найпотужніша від Anthropic, повільніша і дорожча',
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    provider: 'openai',
    description: 'Економний варіант OpenAI',
  },
  {
    id: 'gpt-5',
    label: 'GPT-5',
    provider: 'openai',
    description: 'Найпотужніша від OpenAI',
  },
];

export const DEFAULT_MODEL: AiModelId = 'claude-sonnet-4-6';

@Injectable()
export class ModelRegistry {
  private readonly openai;
  private readonly anthropic;

  constructor(private readonly config: ConfigService) {
    this.openai = createOpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
    this.anthropic = createAnthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  resolve(id: AiModelId | string): LanguageModel {
    const meta = AVAILABLE_MODELS.find((m) => m.id === id);
    if (!meta) {
      throw new BadRequestException(`Unknown model: ${id}`);
    }
    switch (meta.provider) {
      case 'openai':
        return this.openai(meta.id);
      case 'anthropic':
        return this.anthropic(meta.id);
    }
  }

  list(): ModelMeta[] {
    return AVAILABLE_MODELS;
  }
}
