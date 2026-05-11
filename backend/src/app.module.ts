import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { validateEnv } from './config/app.config';
import { PrismaModule } from './shared-kernel/prisma/prisma.module';
import { CredentialsModule } from './shared-kernel/credentials/credentials.module';
import { QueueModule } from './shared-kernel/queues/queue.module';
import { EventsModule } from './shared-kernel/events/events.module';
import { AiKernelModule } from './shared-kernel/ai/ai-kernel.module';
import { AuthModule } from './auth/auth.module';

import { TransactionsModule } from './modules/transactions/transactions.module';
import { CategorizationModule } from './modules/categorization/categorization.module';
import { FxModule } from './modules/fx/fx.module';
import { EducationModule } from './modules/education/education.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { BudgetingModule } from './modules/budgeting/budgeting.module';
import { GoalsModule } from './modules/goals/goals.module';
import { CashflowModule } from './modules/cashflow/cashflow.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { RulesModule } from './modules/rules/rules.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PersonalizationModule } from './modules/personalization/personalization.module';
import { InsightsModule } from './modules/insights/insights.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AiModule } from './modules/ai/ai.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      // Default: 120 requests / minute for any authenticated user.
      { name: 'default', ttl: 60_000, limit: 120 },
      // Tighter bucket used only on AI / LLM-touching endpoints (per-IP).
      { name: 'ai', ttl: 60_000, limit: 10 },
    ]),
    TerminusModule,

    PrismaModule,
    CredentialsModule,
    QueueModule,
    EventsModule,
    AiKernelModule,
    AuthModule,

    AccountsModule,
    TransactionsModule,
    CategorizationModule,
    FxModule,
    EducationModule,
    BudgetingModule,
    GoalsModule,
    CashflowModule,
    RecommendationsModule,
    RulesModule,
    NotificationsModule,
    PersonalizationModule,
    InsightsModule,
    SubscriptionsModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
