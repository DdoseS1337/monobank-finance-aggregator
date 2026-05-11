import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';
import { MemoryConsolidationService } from './consolidation.service';
import { MemoryDecayService } from './decay.service';

/**
 * Worker-only memory maintenance.
 *
 *   03:00 UTC daily — consolidate per active user (LLM reflection over
 *                     last 7 days of episodic memories)
 *   04:00 UTC daily — apply nightly decay to low-importance memories
 *
 * Both jobs are bounded — `MAX_EPISODIC_INPUT` caps LLM token spend, and
 * decay is a single bulk UPDATE.
 */
@Injectable()
export class MemoryMaintenanceScheduler {
  private readonly logger = new Logger(MemoryMaintenanceScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consolidation: MemoryConsolidationService,
    private readonly decay: MemoryDecayService,
  ) {}

  @Cron('0 3 * * *', { name: 'memory:nightly-consolidation', timeZone: 'UTC' })
  async consolidate(): Promise<void> {
    const userIds = await this.activeUsers();
    if (userIds.length === 0) return;
    let totalFacts = 0;
    for (const userId of userIds) {
      try {
        const result = await this.consolidation.consolidateForUser(userId);
        totalFacts += result.semanticAdded;
      } catch (error) {
        this.logger.error(
          `Consolidation failed for ${userId}: ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(`Memory consolidation done: ${totalFacts} new semantic facts across ${userIds.length} users`);
  }

  @Cron('0 4 * * *', { name: 'memory:nightly-decay', timeZone: 'UTC' })
  async runDecay(): Promise<void> {
    await this.decay.applyNightlyDecay();
  }

  private async activeUsers(): Promise<string[]> {
    // We treat anyone who has at least one memory record as active.
    const rows = await this.prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
      `SELECT DISTINCT user_id FROM memory_records WHERE superseded_by IS NULL`,
    );
    return rows.map((r) => r.user_id);
  }
}
