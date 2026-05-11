import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../../auth/supabase.guard';
import { CurrentUser, AuthenticatedUser } from '../../../auth/current-user.decorator';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { Budget } from '../domain/budget.entity';
import { BudgetingService } from '../application/budgeting.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { AddBudgetLineDto, AdjustBudgetLineDto } from './dto/add-line.dto';
import { BudgetMapper, BudgetResponse } from './dto/budget-response.dto';

@ApiTags('budgeting')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('budgets')
export class BudgetingController {
  constructor(
    private readonly service: BudgetingService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCategoryNames(
    budgets: Budget[],
  ): Promise<Map<string, string>> {
    const ids = new Set<string>();
    for (const b of budgets) {
      const period = b.currentPeriod();
      if (!period) continue;
      for (const line of period.lines) {
        if (line.categoryId) ids.add(line.categoryId);
      }
    }
    if (ids.size === 0) return new Map();
    const cats = await this.prisma.category.findMany({
      where: { id: { in: Array.from(ids) } },
      select: { id: true, name: true },
    });
    return new Map(cats.map((c) => [c.id, c.name]));
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBudgetDto,
  ): Promise<BudgetResponse> {
    const budget = await this.service.createBudget({
      userId: user.id,
      name: dto.name,
      method: dto.method,
      cadence: dto.cadence,
      baseCurrency: dto.baseCurrency,
      rolloverPolicy: dto.rolloverPolicy,
      startNow: dto.startNow,
      initialLines: dto.initialLines?.map((l) => ({
        categoryId: l.categoryId ?? null,
        plannedAmount: l.plannedAmount,
        thresholdPct: l.thresholdPct,
      })),
    });
    const names = await this.resolveCategoryNames([budget]);
    return BudgetMapper.toResponse(budget, undefined, names);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<BudgetResponse[]> {
    const budgets = await this.service.listBudgets(
      user.id,
      includeArchived === 'true',
    );
    const names = await this.resolveCategoryNames(budgets);
    return budgets.map((b) => BudgetMapper.toResponse(b, undefined, names));
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BudgetResponse> {
    const budget = await this.service.getBudget(user.id, id);
    const names = await this.resolveCategoryNames([budget]);
    return BudgetMapper.toResponse(budget, undefined, names);
  }

  @Get(':id/health')
  async getHealth(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const health = await this.service.getHealth(user.id, id);
    return {
      status: health.status,
      atRiskLines: health.atRiskLines,
      exceededLines: health.exceededLines,
      totalLines: health.totalLines,
    };
  }

  @Post(':id/lines')
  async addLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddBudgetLineDto,
  ): Promise<BudgetResponse> {
    const budget = await this.service.addLine(user.id, {
      budgetId: id,
      categoryId: dto.categoryId ?? null,
      plannedAmount: dto.plannedAmount,
      thresholdPct: dto.thresholdPct,
    });
    const names = await this.resolveCategoryNames([budget]);
    return BudgetMapper.toResponse(budget, undefined, names);
  }

  @Delete(':id/lines/:lineId')
  async removeLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineId', new ParseUUIDPipe()) lineId: string,
  ): Promise<BudgetResponse> {
    const budget = await this.service.removeLine(user.id, {
      budgetId: id,
      lineId,
    });
    const names = await this.resolveCategoryNames([budget]);
    return BudgetMapper.toResponse(budget, undefined, names);
  }

  @Patch(':id/lines/:lineId')
  async adjustLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineId', new ParseUUIDPipe()) lineId: string,
    @Body() dto: AdjustBudgetLineDto,
  ): Promise<BudgetResponse> {
    const budget = await this.service.adjustLine(user.id, {
      budgetId: id,
      lineId,
      newPlannedAmount: dto.newPlannedAmount,
    });
    const names = await this.resolveCategoryNames([budget]);
    return BudgetMapper.toResponse(budget, undefined, names);
  }

  @Post(':id/recompute')
  async recompute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BudgetResponse> {
    await this.service.getBudget(user.id, id); // ownership check
    const budget = await this.service.recomputeSpentFromHistory(id);
    if (!budget) throw new Error(`Budget ${id} not found`);
    const names = await this.resolveCategoryNames([budget]);
    return BudgetMapper.toResponse(budget, undefined, names);
  }

  @Delete(':id')
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BudgetResponse> {
    const budget = await this.service.archive(user.id, id);
    const names = await this.resolveCategoryNames([budget]);
    return BudgetMapper.toResponse(budget, undefined, names);
  }
}
