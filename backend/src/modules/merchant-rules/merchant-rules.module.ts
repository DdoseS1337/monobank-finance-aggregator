import { Module } from '@nestjs/common';
import { MerchantRuleRepository } from './infrastructure/merchant-rule.repository';
import { MerchantRuleService } from './application/merchant-rule.service';

@Module({
  providers: [MerchantRuleRepository, MerchantRuleService],
  exports: [MerchantRuleService],
})
export class MerchantRulesModule {}
