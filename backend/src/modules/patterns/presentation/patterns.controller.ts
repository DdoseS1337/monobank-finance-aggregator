import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseGuard } from '../../../auth/supabase.guard';
import { AuthUser, CurrentUser } from '../../../auth/current-user.decorator';
import { PatternsService } from '../application/patterns.service';
import { PatternsQueryDto } from './dto/patterns-query.dto';

@Controller('patterns')
@UseGuards(SupabaseGuard)
export class PatternsController {
  constructor(private readonly patternsService: PatternsService) {}

  /** Регулярні платежі — повторювані оплати одному мерчанту з стабільним інтервалом */
  @Get('regular-payments')
  regularPayments(
    @CurrentUser() user: AuthUser,
    @Query() query: PatternsQueryDto,
  ) {
    return this.patternsService.regularPayments(user.id, query);
  }

  /** Підписки — регулярні платежі зі стабільною сумою (Netflix, Spotify тощо) */
  @Get('subscriptions')
  subscriptions(
    @CurrentUser() user: AuthUser,
    @Query() query: PatternsQueryDto,
  ) {
    return this.patternsService.subscriptions(user.id, query);
  }

  /** Повторювані витрати — мерчанти з множинними транзакціями */
  @Get('recurring-expenses')
  recurringExpenses(
    @CurrentUser() user: AuthUser,
    @Query() query: PatternsQueryDto,
  ) {
    return this.patternsService.recurringExpenses(user.id, query);
  }

  /** Поведінка в різні періоди місяця (початок / середина / кінець) */
  @Get('month-period')
  monthPeriod(
    @CurrentUser() user: AuthUser,
    @Query() query: PatternsQueryDto,
  ) {
    return this.patternsService.monthPeriodBehavior(user.id, query);
  }

  /** Фінансові звички — агреговані патерни поведінки */
  @Get('habits')
  habits(
    @CurrentUser() user: AuthUser,
    @Query() query: PatternsQueryDto,
  ) {
    return this.patternsService.financialHabits(user.id, query);
  }
}
