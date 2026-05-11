import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface LlmCompletionInput {
  systemPrompt: string;
  userPrompt: string;
  /** Optional JSON schema name; when set we ask the API for JSON mode. */
  jsonSchema?: { name: string; schema: object };
  temperature?: number;
  maxTokens?: number;
  /** Use cheap model (gpt-4o-mini) instead of the default. */
  cheap?: boolean;
}

export interface LlmCompletionOutput {
  text: string;
  json: unknown | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
}

const COST_TABLE: Record<string, { input: number; output: number }> = {
  // USD per 1M tokens (2025 rates).
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

/**
 * Thin wrapper around OpenAI chat-completions for AI cognitive layer.
 * - Graceful fallback when no API key is set: returns a stubbed response
 *   so callers can degrade to rule-based output without crashing.
 * - Tracks tokens + cost so we can later persist them per AgentTurn.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI | null;
  private readonly defaultModel: string;
  private readonly cheapModel: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY', '');
    this.defaultModel = config.get<string>('OPENAI_MODEL_DEFAULT', 'gpt-4o');
    this.cheapModel = config.get<string>('OPENAI_MODEL_CHEAP', 'gpt-4o-mini');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY not set — LlmService returns stub responses');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async complete(input: LlmCompletionInput): Promise<LlmCompletionOutput | null> {
    if (!this.client) return null;
    const model = input.cheap ? this.cheapModel : this.defaultModel;
    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
        temperature: input.temperature ?? 0.4,
        max_tokens: input.maxTokens ?? 800,
        response_format: input.jsonSchema
          ? {
              type: 'json_schema',
              json_schema: {
                name: input.jsonSchema.name,
                schema: input.jsonSchema.schema as Record<string, unknown>,
                strict: true,
              },
            }
          : undefined,
      });
      const text = response.choices[0]?.message?.content ?? '';
      const tokensIn = response.usage?.prompt_tokens ?? 0;
      const tokensOut = response.usage?.completion_tokens ?? 0;
      const cost = this.computeCost(model, tokensIn, tokensOut);
      let json: unknown | null = null;
      if (input.jsonSchema && text) {
        try {
          json = JSON.parse(text);
        } catch (error) {
          this.logger.warn(`LLM returned invalid JSON: ${(error as Error).message}`);
        }
      }
      return { text, json, tokensIn, tokensOut, costUsd: cost, model };
    } catch (error) {
      this.logger.warn(`LLM completion failed: ${(error as Error).message}`);
      return null;
    }
  }

  private computeCost(model: string, tokensIn: number, tokensOut: number): number {
    const rates = COST_TABLE[model];
    if (!rates) return 0;
    return (tokensIn * rates.input + tokensOut * rates.output) / 1_000_000;
  }
}
