import { randomUUID } from 'crypto';

export type MemoryKind = 'SEMANTIC' | 'EPISODIC' | 'PROCEDURAL';

export interface MemoryRecordProps {
  id: string;
  userId: string;
  kind: MemoryKind;
  content: string;
  embedding: Float32Array | null;
  metadata: Record<string, unknown>;
  importanceScore: number; // 0..1
  decayFactor: number;     // 0..1, multiplier on importance over time
  sourceType: string | null;
  sourceRef: string | null;
  relatedEntities: string[];
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
  supersededById: string | null;
}

/**
 * MemoryRecord aggregate.
 *
 * Implements a 4-layer memory model (Atkinson-Shiffrin-inspired):
 *   - WORKING memory lives in the conversation context only (no DB row).
 *   - EPISODIC: events that happened ("user rejected aggressive saving plan").
 *   - SEMANTIC: persistent facts ("user prefers conservative risk").
 *   - PROCEDURAL: learned playbooks ("for budget overrun, user prefers
 *     reallocation over goal pause").
 *
 * Key invariants:
 *   - importanceScore ∈ [0, 1].
 *   - decayFactor ∈ [0, 1]; the *effective* importance at time t is
 *     `importanceScore * decayFactor^(daysSinceAccessed/30)`.
 *   - A record can be superseded (e.g. when a fact is invalidated by a
 *     newer observation); we never hard-delete to preserve audit history.
 */
export class MemoryRecord {
  private constructor(private props: MemoryRecordProps) {}

  static rehydrate(props: MemoryRecordProps): MemoryRecord {
    return new MemoryRecord(props);
  }

  static create(input: {
    userId: string;
    kind: MemoryKind;
    content: string;
    embedding?: Float32Array | null;
    metadata?: Record<string, unknown>;
    importanceScore?: number;
    sourceType?: string;
    sourceRef?: string | null;
    relatedEntities?: string[];
  }): MemoryRecord {
    if (!input.content.trim()) {
      throw new Error('Memory content required');
    }
    const score = input.importanceScore ?? 0.5;
    if (score < 0 || score > 1) {
      throw new Error('importanceScore must be in [0, 1]');
    }
    const now = new Date();
    return new MemoryRecord({
      id: randomUUID(),
      userId: input.userId,
      kind: input.kind,
      content: input.content.trim(),
      embedding: input.embedding ?? null,
      metadata: input.metadata ?? {},
      importanceScore: score,
      decayFactor: 1,
      sourceType: input.sourceType ?? null,
      sourceRef: input.sourceRef ?? null,
      relatedEntities: input.relatedEntities ?? [],
      createdAt: now,
      accessedAt: now,
      accessCount: 0,
      supersededById: null,
    });
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get kind(): MemoryKind {
    return this.props.kind;
  }
  get content(): string {
    return this.props.content;
  }
  get embedding(): Float32Array | null {
    return this.props.embedding;
  }
  get importanceScore(): number {
    return this.props.importanceScore;
  }
  get decayFactor(): number {
    return this.props.decayFactor;
  }
  get accessedAt(): Date {
    return this.props.accessedAt;
  }
  get accessCount(): number {
    return this.props.accessCount;
  }
  get isSuperseded(): boolean {
    return this.props.supersededById !== null;
  }

  /**
   * Effective recall priority: importance × decay × recency boost.
   * Used for retrieval ranking when no semantic match is available.
   */
  effectiveImportance(at: Date = new Date()): number {
    const days = Math.max(
      0,
      (at.getTime() - this.props.accessedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const decay = Math.pow(this.props.decayFactor, days / 30);
    return this.props.importanceScore * decay;
  }

  // Commands
  recordAccess(at: Date = new Date()): void {
    this.props.accessedAt = at;
    this.props.accessCount += 1;
  }

  applyDecay(factor: number): void {
    if (factor < 0 || factor > 1) {
      throw new Error('decay factor must be in [0, 1]');
    }
    this.props.decayFactor = Math.min(this.props.decayFactor, factor);
  }

  bumpImportance(delta: number): void {
    this.props.importanceScore = Math.max(
      0,
      Math.min(1, this.props.importanceScore + delta),
    );
  }

  supersedeBy(supersedingId: string): void {
    this.props.supersededById = supersedingId;
  }

  toSnapshot(): MemoryRecordProps {
    return {
      ...this.props,
      metadata: { ...this.props.metadata },
      relatedEntities: [...this.props.relatedEntities],
    };
  }
}
