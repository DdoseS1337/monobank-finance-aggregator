import { Module } from '@nestjs/common';
import { MccRepository } from './infrastructure/mcc.repository';
import { MccLookupService } from './application/mcc-lookup.service';

@Module({
  providers: [MccRepository, MccLookupService],
  exports: [MccLookupService],
})
export class MccModule {}
