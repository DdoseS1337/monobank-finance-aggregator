import { Injectable, Logger } from '@nestjs/common';
import { Notification } from '../../domain/notification.entity';
import { ChannelDeliveryResult, NotificationChannel } from './channel.interface';

/**
 * In-app channel = no external delivery — the notification is simply
 * persisted and surfaced in the user's Inbox via REST.
 *
 * We still implement `send()` so the orchestrator can mark the row SENT
 * symmetrically with other channels.
 */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly name = 'in_app' as const;
  private readonly logger = new Logger(InAppChannel.name);

  async send(notification: Notification): Promise<ChannelDeliveryResult> {
    this.logger.debug(`in-app: queued notification ${notification.id} for user ${notification.userId}`);
    return { delivered: true };
  }
}
