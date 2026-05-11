import { Injectable, Logger } from '@nestjs/common';
import { Notification } from '../../domain/notification.entity';
import { ChannelDeliveryResult, NotificationChannel } from './channel.interface';

/**
 * Email stub. Wires up the same shape as a real provider
 * (Resend/Postmark/SES) but only logs in dev. Replace with SDK calls
 * in a Phase-7 deployment hardening.
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly name = 'email' as const;
  private readonly logger = new Logger(EmailChannel.name);

  async send(notification: Notification): Promise<ChannelDeliveryResult> {
    this.logger.warn(
      `[stub] email: would send "${notification.kind}" to user ${notification.userId}`,
    );
    return { delivered: true, metadata: { stub: true } };
  }
}

/**
 * Push stub. Will integrate with FCM/APNS via expo-server-sdk later.
 */
@Injectable()
export class PushChannel implements NotificationChannel {
  readonly name = 'push' as const;
  private readonly logger = new Logger(PushChannel.name);

  async send(notification: Notification): Promise<ChannelDeliveryResult> {
    this.logger.warn(`[stub] push: would deliver ${notification.id}`);
    return { delivered: true, metadata: { stub: true } };
  }
}

/**
 * Telegram bot stub. Real impl uses Telegram Bot API + per-user chatId
 * stored in `user_preferences.telegram_chat_id`.
 */
@Injectable()
export class TelegramChannel implements NotificationChannel {
  readonly name = 'telegram' as const;
  private readonly logger = new Logger(TelegramChannel.name);

  async send(notification: Notification): Promise<ChannelDeliveryResult> {
    this.logger.warn(`[stub] telegram: would deliver ${notification.id}`);
    return { delivered: true, metadata: { stub: true } };
  }
}
