import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_NAMES } from '../queues/queue-names';

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 8;

/**
 * Continuously drains the outbox table and forwards events to BullMQ queues.
 * Runs in worker process; one replica is sufficient for moderate load.
 */
@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisher.name);
  private readonly queues: Map<string, Queue> = new Map();
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.transactions) transactionsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.categorization) categorizationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.budgets) budgetsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.insights) insightsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.subscriptions) subscriptionsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.forecasting) forecastingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.recommendations) recommendationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.rules) rulesQueue: Queue,
    @InjectQueue(QUEUE_NAMES.notifications) notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.aiMemory) aiMemoryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.embeddings) embeddingsQueue: Queue,
  ) {
    this.queues.set(QUEUE_NAMES.transactions, transactionsQueue);
    this.queues.set(QUEUE_NAMES.categorization, categorizationQueue);
    this.queues.set(QUEUE_NAMES.budgets, budgetsQueue);
    this.queues.set(QUEUE_NAMES.insights, insightsQueue);
    this.queues.set(QUEUE_NAMES.subscriptions, subscriptionsQueue);
    this.queues.set(QUEUE_NAMES.forecasting, forecastingQueue);
    this.queues.set(QUEUE_NAMES.recommendations, recommendationsQueue);
    this.queues.set(QUEUE_NAMES.rules, rulesQueue);
    this.queues.set(QUEUE_NAMES.notifications, notificationsQueue);
    this.queues.set(QUEUE_NAMES.aiMemory, aiMemoryQueue);
    this.queues.set(QUEUE_NAMES.embeddings, embeddingsQueue);
  }

  onModuleInit(): void {
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.log('Outbox publisher started');
    this.scheduleNext(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    try {
      const processed = await this.drainBatch();
      this.scheduleNext(processed === 0 ? POLL_INTERVAL_MS : 0);
    } catch (error) {
      this.logger.error('Outbox tick failed', error as Error);
      this.scheduleNext(POLL_INTERVAL_MS * 5);
    }
  }

  private async drainBatch(): Promise<number> {
    const entries = await this.prisma.outboxEntry.findMany({
      where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      include: { event: true },
    });

    if (entries.length === 0) return 0;

    for (const entry of entries) {
      const queue = this.queues.get(entry.destination);
      if (!queue) {
        await this.markFailed(entry.id, `Unknown destination: ${entry.destination}`);
        continue;
      }

      try {
        await queue.add(
          entry.event.eventType,
          {
            eventId: entry.event.id,
            eventType: entry.event.eventType,
            aggregateType: entry.event.aggregateType,
            aggregateId: entry.event.aggregateId,
            payload: entry.event.payload,
            metadata: entry.event.metadata,
            occurredAt: entry.event.occurredAt,
          },
          {
            jobId: `${entry.event.id}:${entry.destination}`,
            removeOnComplete: { age: 86400, count: 1000 },
            removeOnFail: false,
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );

        await this.prisma.outboxEntry.update({
          where: { id: entry.id },
          data: {
            status: 'PUBLISHED',
            attempts: { increment: 1 },
            lastAttemptedAt: new Date(),
          },
        });
      } catch (error) {
        const message = (error as Error).message;
        await this.markFailed(entry.id, message);
      }
    }

    await this.markEventsProcessed(entries.map((e) => e.eventId));
    return entries.length;
  }

  private async markFailed(entryId: string, error: string): Promise<void> {
    await this.prisma.outboxEntry.update({
      where: { id: entryId },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        lastAttemptedAt: new Date(),
        lastError: error,
      },
    });
  }

  private async markEventsProcessed(eventIds: string[]): Promise<void> {
    const fullyProcessed = await this.prisma.domainEvent.findMany({
      where: {
        id: { in: eventIds },
        processedAt: null,
        outbox: { every: { status: { in: ['PUBLISHED', 'FAILED'] } } },
      },
      select: { id: true },
    });

    if (fullyProcessed.length === 0) return;

    await this.prisma.domainEvent.updateMany({
      where: { id: { in: fullyProcessed.map((e) => e.id) } },
      data: { processedAt: new Date() },
    });
  }
}
