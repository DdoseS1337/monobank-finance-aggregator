import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../config/app.config';
import { PrismaModule } from '../shared-kernel/prisma/prisma.module';
import { QueueModule } from '../shared-kernel/queues/queue.module';
import { EventsModule } from '../shared-kernel/events/events.module';
import { AiKernelModule } from '../shared-kernel/ai/ai-kernel.module';
import { BudgetingModule } from '../modules/budgeting/budgeting.module';
import { RulesModule } from '../modules/rules/rules.module';
import { GoalsModule } from '../modules/goals/goals.module';
import { TransactionsModule } from '../modules/transactions/transactions.module';
import { CategorizationModule } from '../modules/categorization/categorization.module';
import { CashflowModule } from '../modules/cashflow/cashflow.module';
import { AiModule } from '../modules/ai/ai.module';
import { RecommendationsModule } from '../modules/recommendations/recommendations.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { PersonalizationModule } from '../modules/personalization/personalization.module';
import { ScheduleModule } from '@nestjs/schedule';

/**
 * Worker process module.
 * Loads BullMQ Processors and the OutboxPublisher.
 * Each domain module is imported here to register its sagas; sagas only
 * become "live" workers when this module bootstraps via workers/main.ts.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    PrismaModule,
    QueueModule,
    EventsModule,
    AiKernelModule,

    ScheduleModule.forRoot(),

    TransactionsModule,
    CategorizationModule,
    BudgetingModule,
    GoalsModule,
    RulesModule,
    CashflowModule,
    AiModule,
    RecommendationsModule,
    NotificationsModule,
    PersonalizationModule,
  ],
})
export class WorkersModule {}
