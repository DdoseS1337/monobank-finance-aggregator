import { MemoryRecord, MemoryKind } from './memory-record.entity';

export const MEMORY_REPOSITORY = Symbol('MemoryRepository');

export interface MemoryQuery {
  userId: string;
  kinds?: MemoryKind[];
  /** When provided, run vector similarity search and order by score. */
  embedding?: Float32Array;
  /** Plaintext fallback used when embedding is missing. */
  searchText?: string;
  topK?: number;
  /** Filter by metadata.relatedEntities array overlap. */
  relatedEntities?: string[];
  /** Skip records superseded by newer ones. */
  excludeSuperseded?: boolean;
}

export interface RecallResult {
  record: MemoryRecord;
  score: number; // similarity (0..1) when embedding present, else effective-importance
}

export interface MemoryRepository {
  save(record: MemoryRecord): Promise<void>;
  findById(id: string): Promise<MemoryRecord | null>;
  recall(query: MemoryQuery): Promise<RecallResult[]>;

  /** Returns episodic records older than `cutoff`, capped at `limit`. */
  episodicSince(userId: string, cutoff: Date, limit: number): Promise<MemoryRecord[]>;

  /** Bulk decay update for low-importance records. Returns affected count. */
  decayBelowThreshold(threshold: number, factor: number): Promise<number>;

  /** Mark records as superseded in batch. */
  markSuperseded(ids: string[], supersedingId: string): Promise<number>;
}
