import { Module } from '@nestjs/common';
import { RulesController } from './presentation/rules.controller';
import { RulesService } from './application/rules.service';
import { RulesSaga } from './application/rules.saga';
import { RulesEngine } from './engine/rules-engine';
import { AstEvaluator } from './engine/ast-evaluator';
import { ActionExecutor } from './engine/action-executor';
import {
  PrismaRuleExecutionRepository,
  PrismaRuleRepository,
} from './infrastructure/rule.repository';
import {
  RULE_EXECUTION_REPOSITORY,
  RULE_REPOSITORY,
} from './domain/repositories.interface';
import { GoalsModule } from '../goals/goals.module';

/**
 * Rules Context — Phase 2.3.
 *
 * Imports GoalsModule because ALLOCATE_PERCENT/ALLOCATE_FIXED actions
 * eventually call GoalsService.contribute under the hood.
 *
 * RulesSaga is a BullMQ Processor; in the API process it is inert.
 * It only consumes the `rules` queue when bootstrapped via WorkersModule.
 */
@Module({
  imports: [GoalsModule],
  controllers: [RulesController],
  providers: [
    RulesService,
    RulesEngine,
    AstEvaluator,
    ActionExecutor,
    RulesSaga,
    { provide: RULE_REPOSITORY, useClass: PrismaRuleRepository },
    { provide: RULE_EXECUTION_REPOSITORY, useClass: PrismaRuleExecutionRepository },
  ],
  exports: [RulesService, RulesEngine],
})
export class RulesModule {}
