import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { Money, Currency } from '../../../shared-kernel/money/money';
import { Envelope } from '../domain/envelope.entity';
import { EnvelopeRepository } from '../domain/repositories.interface';

@Injectable()
export class PrismaEnvelopeRepository implements EnvelopeRepository {
  // Default currency for envelopes; envelopes don't store currency directly
  // (the column is implicit via the user's base currency).
  private readonly defaultCurrency: Currency = 'UAH';

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: DomainEventBus,
  ) {}

  async save(envelope: Envelope): Promise<void> {
    const snapshot = envelope.toSnapshot();
    const events = envelope.pullEvents();

    await this.prisma.$transaction(async (tx) => {
      await tx.envelope.upsert({
        where: { id: snapshot.id },
        create: {
          id: snapshot.id,
          userId: snapshot.userId,
          name: snapshot.name,
          balance: snapshot.balance.amount,
          targetBalance: snapshot.targetBalance?.amount ?? null,
          color: snapshot.color,
          sortOrder: snapshot.sortOrder,
          archivedAt: snapshot.archivedAt,
        },
        update: {
          name: snapshot.name,
          balance: snapshot.balance.amount,
          targetBalance: snapshot.targetBalance?.amount ?? null,
          color: snapshot.color,
          sortOrder: snapshot.sortOrder,
          archivedAt: snapshot.archivedAt,
        },
      });

      for (const event of events) {
        await this.eventBus.publish(event, tx);
      }
    });
  }

  async saveMovement(movement: {
    envelopeId: string;
    amount: string;
    direction: 'IN' | 'OUT' | 'TRANSFER';
    sourceType: string;
    sourceRef: string | null;
    relatedEnvelopeId: string | null;
    occurredAt: Date;
  }): Promise<void> {
    await this.prisma.envelopeMovement.create({
      data: {
        envelopeId: movement.envelopeId,
        amount: new Prisma.Decimal(movement.amount),
        direction: movement.direction,
        sourceType: movement.sourceType,
        sourceRef: movement.sourceRef,
        relatedEnvelopeId: movement.relatedEnvelopeId,
        occurredAt: movement.occurredAt,
      },
    });
  }

  async findById(id: string): Promise<Envelope | null> {
    const row = await this.prisma.envelope.findUnique({ where: { id } });
    if (!row) return null;
    return Envelope.rehydrate({
      id: row.id,
      userId: row.userId,
      name: row.name,
      balance: Money.of(row.balance as unknown as Decimal, this.defaultCurrency),
      targetBalance:
        row.targetBalance !== null
          ? Money.of(row.targetBalance as unknown as Decimal, this.defaultCurrency)
          : null,
      color: row.color,
      sortOrder: row.sortOrder,
      archivedAt: row.archivedAt,
    });
  }

  async findByUser(
    userId: string,
    opts: { includeArchived?: boolean } = {},
  ): Promise<Envelope[]> {
    const rows = await this.prisma.envelope.findMany({
      where: {
        userId,
        ...(opts.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) =>
      Envelope.rehydrate({
        id: r.id,
        userId: r.userId,
        name: r.name,
        balance: Money.of(r.balance as unknown as Decimal, this.defaultCurrency),
        targetBalance:
          r.targetBalance !== null
            ? Money.of(r.targetBalance as unknown as Decimal, this.defaultCurrency)
            : null,
        color: r.color,
        sortOrder: r.sortOrder,
        archivedAt: r.archivedAt,
      }),
    );
  }
}
