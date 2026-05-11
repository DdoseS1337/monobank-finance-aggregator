import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Notification } from '../domain/notification.entity';
import {
  NOTIFICATION_REPOSITORY,
  NotificationRepository,
} from '../domain/repositories.interface';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
  ) {}

  async listInbox(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    return this.repo.list({
      userId,
      channel: 'in_app',
      unreadOnly: opts.unreadOnly,
      limit: opts.limit,
    });
  }

  async markOpened(userId: string, notificationId: string): Promise<Notification> {
    const n = await this.requireOwn(userId, notificationId);
    await this.repo.recordReceipt(notificationId, 'opened');
    return n;
  }

  async markClicked(userId: string, notificationId: string): Promise<Notification> {
    const n = await this.requireOwn(userId, notificationId);
    await this.repo.recordReceipt(notificationId, 'clicked');
    return n;
  }

  async markDismissed(userId: string, notificationId: string): Promise<Notification> {
    const n = await this.requireOwn(userId, notificationId);
    await this.repo.recordReceipt(notificationId, 'dismissed');
    return n;
  }

  private async requireOwn(userId: string, id: string): Promise<Notification> {
    const n = await this.repo.findById(id);
    if (!n || n.userId !== userId) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    return n;
  }
}
