import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { RecommendationPipeline } from './pipeline/pipeline.service';
import { RecommendationsService } from './recommendations.service';

@Injectable()
export class RecommendationsScheduler {
  private readonly logger = new Logger(RecommendationsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: RecommendationPipeline,
    private readonly service: RecommendationsService,
  ) {}

  /** Hourly: run pipeline for users that have at least one active account. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'recommendations:hourly' })
  async hourlyPipeline(): Promise<void> {
    const users = await this.activeUsers();
    if (users.length === 0) return;
    let total = 0;
    for (const userId of users) {
      try {
        const result = await this.pipeline.run(userId);
        total += result.persisted;
      } catch (error) {
        this.logger.error(
          `Hourly pipeline failed for ${userId}: ${(error as Error).message}`,
        );
      }
    }
    if (total > 0) {
      this.logger.log(`Hourly pipeline: ${total} new recommendations across ${users.length} users`);
    }
  }

  /** Every 30 minutes: expire recommendations past `valid_until`. */
  @Cron('*/30 * * * *', { name: 'recommendations:expire-stale' })
  async expireStale(): Promise<void> {
    const expired = await this.service.expireStale();
    if (expired > 0) {
      this.logger.log(`Expired ${expired} stale recommendation(s)`);
    }
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
