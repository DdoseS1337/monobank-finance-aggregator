import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const EMBEDDING_DIM = 1536;
const CACHE_MAX_ENTRIES = 2_000;

/**
 * Shared OpenAI text embedding service.
 *
 *   - Returns Float32Array of length 1536 (text-embedding-3-small).
 *   - In-memory LRU cache (~2k entries) keyed by SHA-256 of the input —
 *     guards against duplicate calls during a request burst (e.g. recommending
 *     the same payload 5 times in a row).
 *   - Graceful fallback: if OPENAI_API_KEY is missing, returns `null`. Callers
 *     are expected to handle null (skip vector ops, fall back to keyword
 *     retrieval, etc.).
 *
 * Production hardening that lives outside this class:
 *   - Persistent cache (e.g. Redis) — currently in-memory only.
 *   - Rate limiting / token budget enforcement (Phase 7).
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly cache: Map<string, Float32Array> = new Map();

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY', '');
    this.model = config.get<string>('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY not set — embedding service will return null and callers must fall back.',
      );
      this.client = null;
    } else {
      this.client = new OpenAI({ apiKey });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  get dimensions(): number {
    return EMBEDDING_DIM;
  }

  async embed(text: string): Promise<Float32Array | null> {
    if (!this.client) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    const key = this.cacheKey(trimmed);
    const cached = this.cache.get(key);
    if (cached) {
      // LRU touch
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: trimmed,
      });
      const vector = response.data[0]?.embedding;
      if (!vector) return null;
      const f32 = new Float32Array(vector);
      this.putCache(key, f32);
      return f32;
    } catch (error) {
      this.logger.warn(
        `Embedding request failed: ${(error as Error).message}; returning null`,
      );
      return null;
    }
  }

  async embedBatch(texts: string[]): Promise<Array<Float32Array | null>> {
    if (!this.client) return texts.map(() => null);
    const trimmed = texts.map((t) => t.trim());
    const result: Array<Float32Array | null> = new Array(texts.length).fill(null);
    const toFetch: Array<{ index: number; text: string; key: string }> = [];

    trimmed.forEach((text, index) => {
      if (!text) return;
      const key = this.cacheKey(text);
      const cached = this.cache.get(key);
      if (cached) {
        result[index] = cached;
      } else {
        toFetch.push({ index, text, key });
      }
    });

    if (toFetch.length === 0) return result;

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: toFetch.map((t) => t.text),
      });
      response.data.forEach((item, i) => {
        const target = toFetch[i];
        if (!target) return;
        const f32 = new Float32Array(item.embedding);
        result[target.index] = f32;
        this.putCache(target.key, f32);
      });
    } catch (error) {
      this.logger.warn(`Batch embedding failed: ${(error as Error).message}`);
    }
    return result;
  }

  /** Cosine similarity between two embeddings; returns 0 if either is null. */
  static similarity(a: Float32Array | null, b: Float32Array | null): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]!;
      const bi = b[i]!;
      dot += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /** Postgres-array literal form for raw queries — `[0.1, 0.2, ...]`. */
  static toPgVector(vector: Float32Array): string {
    return `[${Array.from(vector).join(',')}]`;
  }

  private cacheKey(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  private putCache(key: string, value: Float32Array): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
