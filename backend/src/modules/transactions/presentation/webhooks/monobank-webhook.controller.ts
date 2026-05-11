import { randomUUID } from 'crypto';
import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { Currency } from '../../../../shared-kernel/money/money';
import { PrismaService } from '../../../../shared-kernel/prisma/prisma.service';
import { MonobankClient, MonobankStatementItem } from '../../infrastructure/monobank.client';
import { Transaction } from '../../domain/transaction.entity';
import {
  TRANSACTION_REPOSITORY,
  TransactionRepository,
} from '../../domain/repositories.interface';

interface MonobankWebhookPayload {
  type: string;
  data: {
    account: string;
    statementItem: MonobankStatementItem;
  };
}

/**
 * Monobank pushes statement items to this endpoint when a webhook URL is
 * registered for the user's token. We:
 *
 *  - Look up the local Account by `provider/externalId`.
 *  - Convert the statement item into a Transaction aggregate.
 *  - Persist via TransactionRepository (which emits TransactionImported
 *    through the outbox; categorization saga handles the rest).
 *
 * Auth note: Monobank itself signs payloads via X-Sign header. Verification
 * requires fetching the bank's ECDSA public key. For Phase 2 we treat the
 * endpoint as best-effort and rely on infra (firewall / Cloudflare rules)
 * for now — flagged as TODO for the security review pass.
 */
@ApiTags('webhooks')
@Controller('webhooks/monobank')
export class MonobankWebhookController {
  private readonly logger = new Logger(MonobankWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: TransactionRepository,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(@Body() payload: MonobankWebhookPayload): Promise<{ ok: true }> {
    if (payload?.type !== 'StatementItem') {
      this.logger.debug(`Ignoring webhook of type ${payload?.type}`);
      return { ok: true };
    }
    const account = await this.prisma.account.findUnique({
      where: { provider_externalId: { provider: 'monobank', externalId: payload.data.account } },
    });
    if (!account) {
      this.logger.warn(
        `Webhook for unknown account ${payload.data.account}; ignoring`,
      );
      return { ok: true };
    }

    const tx = this.toTransaction(
      account.userId,
      account.id,
      account.currency as Currency,
      payload.data.statementItem,
    );
    const result = await this.transactions.saveBatch([tx]);
    this.logger.log(
      `Webhook ingest: account=${account.id} inserted=${result.inserted} skipped=${result.skipped}`,
    );
    return { ok: true };
  }

  private toTransaction(
    userId: string,
    accountId: string,
    accountCurrency: Currency,
    item: MonobankStatementItem,
  ): Transaction {
    const operationCurrency = MonobankClient.currencyCodeToIso(
      item.currencyCode,
    ) as Currency;
    return Transaction.fromMonobank({
      id: randomUUID(),
      userId,
      accountId,
      externalId: item.id,
      amountMinor: item.amount,
      currency: accountCurrency,
      description: item.description,
      merchantName: item.counterName ?? null,
      mccCode: item.mcc,
      type: item.amount >= 0 ? 'CREDIT' : 'DEBIT',
      status: item.hold ? 'PENDING' : 'POSTED',
      transactionDate: new Date(item.time * 1000),
      metadata: {
        operationAmount: item.operationAmount,
        operationCurrency,
        commissionRate: item.commissionRate,
        cashbackAmount: item.cashbackAmount,
        balance: item.balance,
        comment: item.comment,
        hold: item.hold,
        receiptId: item.receiptId,
        invoiceId: item.invoiceId,
        webhookReceivedAt: new Date().toISOString(),
      },
    });
  }
}
