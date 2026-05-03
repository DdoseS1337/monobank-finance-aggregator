import { Module } from '@nestjs/common';
import { BANK_PROVIDERS } from '../../common/constants/injection-tokens';
import { MonobankClientService } from '../transactions/infrastructure/providers/monobank/monobank-client.service';
import { MonobankTransactionProvider } from '../transactions/infrastructure/providers/monobank/monobank-transaction.provider';

@Module({
  providers: [
    MonobankClientService,
    MonobankTransactionProvider,
    {
      provide: BANK_PROVIDERS,
      useFactory: (monobank: MonobankTransactionProvider) => [monobank],
      inject: [MonobankTransactionProvider],
    },
  ],
  exports: [BANK_PROVIDERS],
})
export class BankProvidersModule {}
