import { Inject, Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { Notification, Channel, Severity } from '../domain/notification.entity';
import {
  NOTIFICATION_REPOSITORY,
  NotificationRepository,
} from '../domain/repositories.interface';
import { InAppChannel } from './channels/in-app.channel';
import {
  EmailChannel,
  PushChannel,
  TelegramChannel,
} from './channels/stub-channels';
import { NotificationChannel } from './channels/channel.interface';

const DEDUP_WINDOW_MINUTES = 60;
const DELIVERY_BATCH_SIZE = 50;

export interface DispatchInput {
  userId: string;
  kind: string;
  severity?: Severity;
  payload: Record<string, unknown>;
  /** When omitted we use the user's preferred channels from `user_profiles`. */
  channels?: Channel[];
  /** Used to suppress duplicates within a 60-minute window. */
  dedupKey?: string;
  recommendationId?: string;
  /** Hard override of the user's quiet hours. Critical alerts only. */
  bypassQuietHours?: boolean;
}

/**
 * Notification Orchestrator — Phase 5.1.
 *
 * One entry-point: `dispatch()`.
 *
 *   1. Resolve user prefs (channels + quiet hours).
 *   2. For each channel:
 *        a. Skip if duplicate within the dedup window.
 *        b. Reschedule into post-quiet-hour window if needed.
 *        c. Persist a Notification row.
 *   3. The `deliverDue()` worker picks them up, sends through the channel,
 *      and updates status.
 *
 * Channel preference learning is intentionally simple here:
 *   - Read `user_profiles.preferred_channels` (or [in_app] default).
 *   - In Phase 5.2 the personalization layer will adjust this based on
 *     historical receipt rates (channels with higher open-through rate win).
 */
@Injectable()
export class NotificationOrchestrator {
  private readonly logger = new Logger(NotificationOrchestrator.name);
  private readonly channels: Map<Channel, NotificationChannel>;
  // ↑ assigned in the constructor body

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    inApp: InAppChannel,
    email: EmailChannel,
    push: PushChannel,
    telegram: TelegramChannel,
  ) {
    this.channels = new Map<Channel, NotificationChannel>();
    for (const ch of [inApp, email, push, telegram] as NotificationChannel[]) {
      this.channels.set(ch.name, ch);
    }
  }

  async dispatch(input: DispatchInput): Promise<{ enqueued: number; skipped: number }> {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId: input.userId } });
    const preferredChannels = (
      input.channels ?? (profile?.preferredChannels as Channel[] | undefined) ?? ['in_app']
    ) as Channel[];

    const quietHours = profile?.quietHours as
      | { from: string; to: string }
      | null
      | undefined;

    let enqueued = 0;
    let skipped = 0;

    for (const channel of preferredChannels) {
      if (!this.channels.has(channel)) {
        skipped++;
        continue;
      }

      // Dedup: if a similar notification has been queued / sent recently, skip.
      if (input.dedupKey) {
        const recent = await this.repo.countByDedupKey(
          input.userId,
          `${input.dedupKey}:${channel}`,
          DEDUP_WINDOW_MINUTES,
        );
        if (recent > 0) {
          skipped++;
          continue;
        }
      }

      let scheduledFor = new Date();
      if (
        !input.bypassQuietHours &&
        input.severity !== 'CRITICAL' &&
        quietHours &&
        this.isInQuietHours(scheduledFor, quietHours)
      ) {
        scheduledFor = this.nextWakeUp(scheduledFor, quietHours);
      }

      const notification = Notification.create({
        userId: input.userId,
        channel,
        kind: input.kind,
        severity: input.severity,
        payload: input.payload,
        scheduledFor,
        dedupKey: input.dedupKey ? `${input.dedupKey}:${channel}` : undefined,
        recommendationId: input.recommendationId,
      });
      await this.repo.save(notification);
      enqueued++;
    }
    return { enqueued, skipped };
  }

  /**
   * Worker entrypoint — drains the due queue, sends through the appropriate
   * channel, and updates status. Single replica is sufficient at MVP scale.
   */
  async deliverDue(): Promise<{ sent: number; failed: number; skipped: number }> {
    const batch = await this.repo.fetchDueBatch(DELIVERY_BATCH_SIZE);
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const notification of batch) {
      const channel = this.channels.get(notification.channel);
      if (!channel) {
        notification.markSkipped(`unknown_channel:${notification.channel}`);
        await this.repo.save(notification);
        skipped++;
        continue;
      }
      try {
        const result = await channel.send(notification);
        if (result.delivered) {
          notification.markSent();
          sent++;
        } else {
          notification.markFailed(result.error ?? 'channel_failed');
          failed++;
        }
        await this.repo.save(notification);
      } catch (error) {
        notification.markFailed((error as Error).message);
        await this.repo.save(notification);
        failed++;
        this.logger.error(`Channel ${channel.name} threw: ${(error as Error).message}`);
      }
    }
    return { sent, failed, skipped };
  }

  // ────────────────────────── Quiet hours ──────────────────────────

  private isInQuietHours(at: Date, quiet: { from: string; to: string }): boolean {
    const minutes = at.getHours() * 60 + at.getMinutes();
    const fromMin = this.parseTime(quiet.from);
    const toMin = this.parseTime(quiet.to);
    if (fromMin <= toMin) {
      return minutes >= fromMin && minutes < toMin;
    }
    // Wraps midnight (e.g. 22:00 → 08:00).
    return minutes >= fromMin || minutes < toMin;
  }

  private nextWakeUp(at: Date, quiet: { from: string; to: string }): Date {
    const toMin = this.parseTime(quiet.to);
    const candidate = dayjs(at).startOf('day').add(toMin, 'minute');
    return (candidate.toDate() <= at ? candidate.add(1, 'day') : candidate).toDate();
  }

  private parseTime(hhmm: string): number {
    const [hRaw, mRaw] = hhmm.split(':');
    return Number(hRaw ?? 0) * 60 + Number(mRaw ?? 0);
  }
}
