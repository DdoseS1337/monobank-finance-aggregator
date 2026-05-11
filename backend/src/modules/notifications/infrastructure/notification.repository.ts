import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { Channel, Notification, NotificationStatus, Severity } from '../domain/notification.entity';
import {
  ListNotificationsFilter,
  NotificationRepository,
} from '../domain/repositories.interface';

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(notification: Notification): Promise<void> {
    const s = notification.toSnapshot();
    await this.prisma.notification.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        userId: s.userId,
        channel: s.channel,
        kind: s.kind,
        severity: s.severity,
        payload: s.payload as Prisma.InputJsonValue,
        scheduledFor: s.scheduledFor,
        sentAt: s.sentAt,
        status: s.status,
        dedupKey: s.dedupKey,
        recommendationId: s.recommendationId,
        retryCount: s.retryCount,
        error: s.error,
      },
      update: {
        scheduledFor: s.scheduledFor,
        sentAt: s.sentAt,
        status: s.status,
        retryCount: s.retryCount,
        error: s.error,
      },
    });
  }

  async findById(id: string): Promise<Notification | null> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    return row ? this.toAggregate(row) : null;
  }

  async list(filter: ListNotificationsFilter): Promise<Notification[]> {
    const limit = Math.min(filter.limit ?? 50, 200);
    const rows = await this.prisma.notification.findMany({
      where: {
        userId: filter.userId,
        ...(filter.channel ? { channel: filter.channel } : {}),
        ...(filter.unreadOnly
          ? { receipts: { none: { openedAt: { not: null } } } }
          : {}),
      },
      orderBy: { scheduledFor: 'desc' },
      take: limit,
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async countByDedupKey(userId: string, dedupKey: string, sinceMinutes: number): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        dedupKey,
        scheduledFor: { gte: dayjs().subtract(sinceMinutes, 'minute').toDate() },
        status: { not: 'FAILED' },
      },
    });
  }

  async recordReceipt(
    notificationId: string,
    kind: 'opened' | 'clicked' | 'dismissed',
  ): Promise<void> {
    await this.prisma.notificationReceipt.upsert({
      where: { id: notificationId },
      create: {
        id: notificationId,
        notificationId,
        ...(kind === 'opened' ? { openedAt: new Date() } : {}),
        ...(kind === 'clicked' ? { clickedAt: new Date() } : {}),
        ...(kind === 'dismissed' ? { dismissedAt: new Date() } : {}),
      },
      update: {
        ...(kind === 'opened' ? { openedAt: new Date() } : {}),
        ...(kind === 'clicked' ? { clickedAt: new Date() } : {}),
        ...(kind === 'dismissed' ? { dismissedAt: new Date() } : {}),
      },
    });
  }

  async fetchDueBatch(limit: number): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { status: 'PENDING', scheduledFor: { lte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      take: limit,
    });
    return rows.map((r) => this.toAggregate(r));
  }

  private toAggregate(row: {
    id: string;
    userId: string;
    channel: string;
    kind: string;
    severity: string;
    payload: Prisma.JsonValue;
    scheduledFor: Date;
    sentAt: Date | null;
    status: string;
    dedupKey: string | null;
    recommendationId: string | null;
    retryCount: number;
    error: string | null;
  }): Notification {
    return Notification.rehydrate({
      id: row.id,
      userId: row.userId,
      channel: row.channel as Channel,
      kind: row.kind,
      severity: row.severity as Severity,
      payload: (row.payload as Record<string, unknown>) ?? {},
      scheduledFor: row.scheduledFor,
      sentAt: row.sentAt,
      status: row.status as NotificationStatus,
      dedupKey: row.dedupKey,
      recommendationId: row.recommendationId,
      retryCount: row.retryCount,
      error: row.error,
    });
  }
}
