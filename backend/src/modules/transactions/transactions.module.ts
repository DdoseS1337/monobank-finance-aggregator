import { Module } from '@nestjs/common';
import { TransactionsController } from './presentation/transactions.controller';
import { MonobankWebhookController } from './presentation/webhooks/monobank-webhook.controller';
import { TransactionsService } from './application/transactions.service';
import { MonobankImportService } from './application/monobank-import.service';
import { SpendingDecompositionService } from './application/spending-decomposition.service';
import { MonobankClient } from './infrastructure/monobank.client';
import { PrismaTransactionRepository } from './infrastructure/transaction.repository';
import { TRANSACTION_REPOSITORY } from './domain/repositories.interface';
import { CategorizationModule } from '../categorization/categorization.module';

@Module({
  imports: [CategorizationModule],
  controllers: [TransactionsController, MonobankWebhookController],
  providers: [
    TransactionsService,
    MonobankImportService,
    SpendingDecompositionService,
    MonobankClient,
    { provide: TRANSACTION_REPOSITORY, useClass: PrismaTransactionRepository },
  ],
  exports: [
    TransactionsService,
    MonobankImportService,
    SpendingDecompositionService,
    MonobankClient,
    TRANSACTION_REPOSITORY,
  ],
})
export class TransactionsModule {}
