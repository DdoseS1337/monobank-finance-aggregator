import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MEMORY_REPOSITORY,
  MemoryRepository,
} from '../domain/repositories.interface';

const LOW_IMPORTANCE_THRESHOLD = 0.3;
const NIGHTLY_DECAY_FACTOR = 0.95; // 5% per night for low-importance records

@Injectable()
export class MemoryDecayService {
  private readonly logger = new Logger(MemoryDecayService.name);

  constructor(
    @Inject(MEMORY_REPOSITORY)
    private readonly memory: MemoryRepository,
  ) {}

  /**
   * Applies a small multiplicative decay to records below the importance
   * threshold. Over time, low-importance episodic memories fade out
   * naturally; consolidation promotes durable patterns to SEMANTIC where
   * decay does not apply (effectively immortal until superseded).
   */
  async applyNightlyDecay(): Promise<number> {
    const affected = await this.memory.decayBelowThreshold(
      LOW_IMPORTANCE_THRESHOLD,
      NIGHTLY_DECAY_FACTOR,
    );
    if (affected > 0) {
      this.logger.log(`Memory decay applied to ${affected} record(s)`);
    }
    return affected;
  }
}
