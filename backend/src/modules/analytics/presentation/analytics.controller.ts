import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseGuard } from '../../../auth/supabase.guard';
import { AuthUser, CurrentUser } from '../../../auth/current-user.decorator';
import { AnalyticsQueryService } from '../application/analytics-query.service';
import {
  AnalyticsQueryDto,
  IncomeVsExpenseQueryDto,
  PeriodComparisonQueryDto,
} from './dto/analytics-query.dto';

@Controller('analytics')
@UseGuards(SupabaseGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsQueryService) {}

  @Get('spending-by-category')
  spendingByCategory(
    @CurrentUser() user: AuthUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.spendingByCategory(user.id, query);
  }

  @Get('monthly-trend')
  monthlyTrend(
    @CurrentUser() user: AuthUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.monthlyTrend(user.id, query);
  }

  @Get('income-vs-expense')
  incomeVsExpense(
    @CurrentUser() user: AuthUser,
    @Query() query: IncomeVsExpenseQueryDto,
  ) {
    return this.analyticsService.incomeVsExpense(user.id, query);
  }

  @Get('top-categories')
  topCategories(
    @CurrentUser() user: AuthUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.topCategories(user.id, query);
  }

  @Get('period-comparison')
  periodComparison(
    @CurrentUser() user: AuthUser,
    @Query() query: PeriodComparisonQueryDto,
  ) {
    return this.analyticsService.periodComparison(user.id, query);
  }

  @Get('spending-trend')
  spendingTrend(
    @CurrentUser() user: AuthUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.spendingTrend(user.id, query);
  }

  @Get('average-transaction')
  averageTransaction(
    @CurrentUser() user: AuthUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.averageTransaction(user.id, query);
  }

  @Get('day-of-week')
  dayOfWeek(
    @CurrentUser() user: AuthUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.dayOfWeek(user.id, query);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: AuthUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.summary(user.id, query.accountId);
  }

  @Get('top-merchants')
  topMerchants(
    @CurrentUser() user: AuthUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.topMerchants(user.id, query);
  }

  @Get('income-summary')
  incomeSummary(
    @CurrentUser() user: AuthUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.incomeSummary(user.id, query);
  }
}
