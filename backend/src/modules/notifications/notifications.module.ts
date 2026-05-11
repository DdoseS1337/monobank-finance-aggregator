import { Module } from '@nestjs/common';
import { NotificationsController } from './presentation/notifications.controller';
import { NotificationsService } from './application/notifications.service';
import { NotificationOrchestrator } from './application/notification-orchestrator.service';
import { NotificationsSaga } from './application/notifications.saga';
import { NotificationsScheduler } from './application/notifications.scheduler';
import { InAppChannel } from './application/channels/in-app.channel';
import {
  EmailChannel,
  PushChannel,
  TelegramChannel,
} from './application/channels/stub-channels';
import { PrismaNotificationRepository } from './infrastructure/notification.repository';
import { NOTIFICATION_REPOSITORY } from './domain/repositories.interface';

/**
 * Notification Context — Phase 5.1.
 *
 * Channels: in-app (real), email/push/telegram (stubs that log in dev).
 * The Orchestrator implements throttle / dedup / quiet-hours / channel pref.
 * The Saga subscribes to user-visible domain events and dispatches.
 * The Scheduler drains the outbox once per minute (worker process only).
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationOrchestrator,
    NotificationsSaga,
    NotificationsScheduler,
    InAppChannel,
    EmailChannel,
    PushChannel,
    TelegramChannel,
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
  ],
  exports: [NotificationsService, NotificationOrchestrator],
})
export class NotificationsModule {}
