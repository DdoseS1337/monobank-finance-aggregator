import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseGuard } from '../../../auth/supabase.guard';
import { AuthUser, CurrentUser } from '../../../auth/current-user.decorator';
import { ForecastingService } from '../application/forecasting.service';
import { ForecastingQueryDto } from './dto/forecasting-query.dto';

@Controller('forecast')
@UseGuards(SupabaseGuard)
export class ForecastingController {
  constructor(private readonly forecastingService: ForecastingService) {}

  /** Прогноз балансу з довірчими інтервалами */
  @Get('cash-flow')
  cashFlow(
    @CurrentUser() user: AuthUser,
    @Query() query: ForecastingQueryDto,
  ) {
    return this.forecastingService.cashFlow(user.id, query);
  }

  /** Прогноз витрат до кінця місяця (pessimistic/realistic/optimistic) */
  @Get('end-of-month')
  endOfMonth(
    @CurrentUser() user: AuthUser,
    @Query() query: ForecastingQueryDto,
  ) {
    return this.forecastingService.endOfMonth(user.id, query);
  }

  /** Прогноз по кожній категорії з confidence score */
  @Get('by-category')
  byCategory(
    @CurrentUser() user: AuthUser,
    @Query() query: ForecastingQueryDto,
  ) {
    return this.forecastingService.byCategory(user.id, query);
  }

  /** Burn rate — за скільки днів закінчиться баланс */
  @Get('burn-rate')
  burnRate(
    @CurrentUser() user: AuthUser,
    @Query() query: ForecastingQueryDto,
  ) {
    return this.forecastingService.burnRate(user.id, query);
  }

  /** Порівняння точності моделей (MAPE) */
  @Get('model-comparison')
  modelComparison(
    @CurrentUser() user: AuthUser,
    @Query() query: ForecastingQueryDto,
  ) {
    return this.forecastingService.modelComparison(user.id, query);
  }
}
