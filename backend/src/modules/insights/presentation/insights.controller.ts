import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseGuard } from '../../../auth/supabase.guard';
import { AuthUser, CurrentUser } from '../../../auth/current-user.decorator';
import { InsightsService } from '../application/insights.service';
import { InsightsQueryDto } from './dto/insights-query.dto';

@Controller('insights')
@UseGuards(SupabaseGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  /** Всі інсайти разом — відсортовані за severity + дата */
  @Get()
  all(
    @CurrentUser() user: AuthUser,
    @Query() query: InsightsQueryDto,
  ) {
    return this.insightsService.all(user.id, query);
  }

  /** Аномальні транзакції (z-score > threshold) */
  @Get('anomalies')
  anomalies(
    @CurrentUser() user: AuthUser,
    @Query() query: InsightsQueryDto,
  ) {
    return this.insightsService.anomalies(user.id, query);
  }

  /** Різке зростання категорій (порівняно з попереднім аналогічним періодом) */
  @Get('category-spikes')
  categorySpikes(
    @CurrentUser() user: AuthUser,
    @Query() query: InsightsQueryDto,
  ) {
    return this.insightsService.categorySpikes(user.id, query);
  }

  /** Нетипові покупки (рідкісні категорії) */
  @Get('unusual-purchases')
  unusualPurchases(
    @CurrentUser() user: AuthUser,
    @Query() query: InsightsQueryDto,
  ) {
    return this.insightsService.unusualPurchases(user.id, query);
  }

  /** Автоматичні фінансові висновки */
  @Get('conclusions')
  conclusions(
    @CurrentUser() user: AuthUser,
    @Query() query: InsightsQueryDto,
  ) {
    return this.insightsService.conclusions(user.id, query);
  }
}
