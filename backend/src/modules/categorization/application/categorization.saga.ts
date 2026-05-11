import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { DomainEvent } from '../../../shared-kernel/events/domain-event';
import { QUEUE_NAMES } from '../../../shared-kernel/queues/queue-names';
import { CategorizationService } from './categorization.service';

interface OutboxEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

interface TransactionImportedPayload {
  transactionId: string;
  userId: string;
  accountId: string;
  amount: string;
  currency: string;
  type: string;
  mccCode: number | null;
  merchantName: string | null;
  description: string | null;
}

interface TransactionCategorizedPayload {
  transactionId: string;
  userId: string;
  categoryId: string;
  categorySlug: string;
  source: 'MERCHANT_RULE' | 'MCC' | 'FALLBACK_OTHER';
  amount: string;
  currency: string;
  type: string;
  mccCode: number | null;
  merchantName: string | null;
  description: string | null;
}

class TransactionCategorized extends DomainEvent<TransactionCategorizedPayload> {
  constructor(aggregateId: string, payload: TransactionCategorizedPayload) {
    super('Transaction', aggregateId, payload, { userId: payload.userId });
  }
  get eventType(): string {
    return 'transaction.categorized';
  }
}

@Processor(QUEUE_NAMES.categorization)
@Injectable()
export class CategorizationSaga extends WorkerHost {
  private readonly logger = new Logger(CategorizationSaga.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
    private readonly categorization: CategorizationService,
  ) {
    super();
  }

  async process(job: Job<OutboxEnvelope>): Promise<void> {
    if (job.data.eventType !== 'transaction.imported') return;
    const { payload } = job.data as OutboxEnvelope<TransactionImportedPayload>;

    const tx = await this.prisma.transaction.findUnique({
      where: { id: payload.transactionId },
      select: { id: true, categoryId: true },
    });
    if (!tx) {
      this.logger.warn(`Transaction ${payload.transactionId} disappeared before categorization`);
      return;
    }
    if (tx.categoryId) {
      this.logger.debug(`Transaction ${tx.id} already categorized; skipping`);
      return;
    }

    const result = await this.categorization.categorize({
      description: payload.description,
      merchantName: payload.merchantName,
      mccCode: payload.mccCode,
    });

    await this.prisma.$transaction(async (txnClient) => {
      await txnClient.transaction.update({
        where: { id: payload.transactionId },
        data: { categoryId: result.categoryId },
      });

      const event = new TransactionCategorized(payload.transactionId, {
        transactionId: payload.transactionId,
        userId: payload.userId,
        categoryId: result.categoryId,
        categorySlug: result.categorySlug,
        source: result.source,
        amount: payload.amount,
        currency: payload.currency,
        type: payload.type,
        mccCode: payload.mccCode,
        merchantName: payload.merchantName,
        description: payload.description,
      });
      await this.events.publish(event, txnClient);
    });
  }
}
