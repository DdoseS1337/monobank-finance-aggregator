import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDestinations } from './event-routing';
import { DomainEvent } from './domain-event';

/**
 * Persists domain events into the transactional outbox.
 *
 * Usage:
 *   await prisma.$transaction(async (tx) => {
 *     await someAggregate.mutate(tx);
 *     await eventBus.publish(event, tx);
 *   });
 *
 * The OutboxPublisher worker then ships entries to BullMQ.
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);

  constructor(private readonly prisma: PrismaService) {}

  async publish(
    event: DomainEvent,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    await client.domainEvent.create({
      data: {
        id: event.eventId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        payload: event.payload as Prisma.InputJsonValue,
        metadata: event.metadata as Prisma.InputJsonValue,
        occurredAt: event.occurredAt,
        userId: event.metadata.userId as string | undefined,
      },
    });

    const destinations = resolveDestinations(event.eventType);
    if (destinations.length === 0) {
      this.logger.debug(`No destinations for ${event.eventType}; persisted event only`);
      await client.domainEvent.update({
        where: { id: event.eventId },
        data: { processedAt: new Date() },
      });
      return;
    }

    await client.outboxEntry.createMany({
      data: destinations.map((destination) => ({
        eventId: event.eventId,
        destination,
        status: 'PENDING',
      })),
    });
  }

  async publishMany(
    events: DomainEvent[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    for (const event of events) {
      await this.publish(event, tx);
    }
  }
}
