import { Module } from '@nestjs/common';
import { BankProvidersModule } from '../bank-providers/bank-providers.module';
import { AccountRepository } from './infrastructure/account.repository';
import { AccountService } from './application/account.service';
import { AccountsController } from './presentation/accounts.controller';

@Module({
  imports: [BankProvidersModule],
  controllers: [AccountsController],
  providers: [AccountRepository, AccountService],
  exports: [AccountRepository],
})
export class AccountsModule {}
