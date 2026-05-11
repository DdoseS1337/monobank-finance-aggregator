import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { FxController } from './fx.controller';
import { FxRatesService } from './fx-rates.service';

@Module({
  imports: [TransactionsModule],
  controllers: [FxController],
  providers: [FxRatesService],
  exports: [FxRatesService],
})
export class FxModule {}
