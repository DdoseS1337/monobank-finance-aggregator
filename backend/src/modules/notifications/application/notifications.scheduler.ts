import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationOrchestrator } from './notification-orchestrator.service';

/**
 * Drains the notifications outbox at minute-level cadence. Workers-only.
 * For tighter latency you can swap this for a BullMQ "delayed jobs" queue
 * — but a 1-minute polling loop is fine until traffic justifies it.
 */
@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(private readonly orchestrator: NotificationOrchestrator) {}

  @Cron('* * * * *', { name: 'notifications:deliver' })
  async deliver(): Promise<void> {
    const result = await this.orchestrator.deliverDue();
    if (result.sent + result.failed > 0) {
      this.logger.log(
        `Delivered ${result.sent}, failed ${result.failed}, skipped ${result.skipped}`,
      );
    }
  }
}
