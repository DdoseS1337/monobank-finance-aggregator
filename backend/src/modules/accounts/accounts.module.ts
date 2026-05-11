import { forwardRef, Module } from '@nestjs/common';
import { AccountsController } from './presentation/accounts.controller';
import { AccountsService } from './application/accounts.service';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [forwardRef(() => TransactionsModule)],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
