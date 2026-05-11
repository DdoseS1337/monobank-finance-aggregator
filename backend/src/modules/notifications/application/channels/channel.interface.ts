import { Notification } from '../../domain/notification.entity';

export interface ChannelDeliveryResult {
  delivered: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * One implementation per delivery channel. Channels never throw — they
 * return a structured result so the orchestrator can record retries.
 */
export interface NotificationChannel {
  readonly name: 'in_app' | 'email' | 'push' | 'telegram';
  send(notification: Notification): Promise<ChannelDeliveryResult>;
}
