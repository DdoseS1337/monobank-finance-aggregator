import { Module } from '@nestjs/common';
import { BankProvidersModule } from '../bank-providers/bank-providers.module';
import { MccModule } from '../mcc/mcc.module';
import { MerchantRulesModule } from '../merchant-rules/merchant-rules.module';
import { TransactionIngestionService } from './application/transaction-ingestion.service';
import { TransactionQueryService } from './application/transaction-query.service';
import { CsvImportService } from './application/csv-import.service';
import { ManualTransactionService } from './application/manual-transaction.service';
import { TransactionRepository } from './infrastructure/repositories/transaction.repository';
import { TransactionsController } from './presentation/transactions.controller';

@Module({
  imports: [BankProvidersModule, MccModule, MerchantRulesModule],
  controllers: [TransactionsController],
  providers: [
    TransactionIngestionService,
    TransactionQueryService,
    CsvImportService,
    ManualTransactionService,
    TransactionRepository,
  ],
  exports: [TransactionIngestionService, TransactionRepository],
})
export class TransactionsModule {}
