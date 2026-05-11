import { Notification } from './notification.entity';

export const NOTIFICATION_REPOSITORY = Symbol('NotificationRepository');

export interface ListNotificationsFilter {
  userId: string;
  channel?: 'in_app' | 'email' | 'push' | 'telegram';
  unreadOnly?: boolean;
  limit?: number;
}

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  findById(id: string): Promise<Notification | null>;
  list(filter: ListNotificationsFilter): Promise<Notification[]>;
  countByDedupKey(userId: string, dedupKey: string, sinceMinutes: number): Promise<number>;
  recordReceipt(notificationId: string, kind: 'opened' | 'clicked' | 'dismissed'): Promise<void>;
  /** Lock + return the next pending notification batch for delivery. */
  fetchDueBatch(limit: number): Promise<Notification[]>;
}
