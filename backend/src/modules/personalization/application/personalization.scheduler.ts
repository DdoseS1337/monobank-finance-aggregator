import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { PersonalizationService } from './personalization.service';

/**
 * Nightly behavioral-traits refresh.
 *
 *   05:00 UTC — recompute traits for every user with at least one transaction
 *               in the last 90 days. Workers-only (single replica).
 */
@Injectable()
export class PersonalizationScheduler {
  private readonly logger = new Logger(PersonalizationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly service: PersonalizationService,
  ) {}

  @Cron('0 5 * * *', { name: 'personalization:traits-refresh', timeZone: 'UTC' })
  async refresh(): Promise<void> {
    const users = await this.activeUsers();
    if (users.length === 0) return;
    let ok = 0;
    let failed = 0;
    for (const userId of users) {
      try {
        await this.service.refreshBehaviorModel(userId);
        ok++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Behavior refresh failed for ${userId}: ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(`Behavior refresh: ok=${ok} failed=${failed} (${users.length} active users)`);
  }

  private async activeUsers(): Promise<string[]> {
    const rows = await this.prisma.account.findMany({
      where: { archivedAt: null },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }
}
