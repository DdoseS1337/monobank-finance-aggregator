import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { MccModule } from './modules/mcc/mcc.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { MerchantRulesModule } from './modules/merchant-rules/merchant-rules.module';
import { AuthModule } from './auth/auth.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PatternsModule } from './modules/patterns/patterns.module';
import { InsightsModule } from './modules/insights/insights.module';
import { ForecastingModule } from './modules/forecasting/forecasting.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    MccModule,
    TransactionsModule,
    AccountsModule,
    MerchantRulesModule,
    AnalyticsModule,
    PatternsModule,
    InsightsModule,
    ForecastingModule,
    AiAssistantModule,
  ],
})
export class AppModule {}
