import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../../auth/supabase.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../auth/current-user.decorator';
import { CashflowService } from '../application/cashflow.service';
import { CashFlowProjection } from '../domain/projection.entity';
import { RefreshForecastDto } from './dto/cashflow-dto';

interface ProjectionResponse {
  id: string;
  horizonDays: number;
  generatedAt: string;
  modelVersion: string;
  confidenceScore: number | null;
  isLatest: boolean;
  points: Array<{
    day: string;
    balanceP10: string;
    balanceP50: string;
    balanceP90: string;
    expectedInflow: string;
    expectedOutflow: string;
    hasDeficitRisk: boolean;
  }>;
  assumptions: Array<{ key: string; value: unknown; source: string }>;
  deficitWindows: Array<{
    start: string;
    end: string;
    worstDay: string;
    worstAmount: number;
    confidence: number;
  }>;
}

function mapProjection(p: CashFlowProjection): ProjectionResponse {
  return {
    id: p.id,
    horizonDays: p.horizonDays,
    generatedAt: p.generatedAt.toISOString(),
    modelVersion: p.modelVersion,
    confidenceScore: p.confidenceScore,
    isLatest: p.isLatest,
    points: p.points.map((pt) => {
      const s = pt.toSnapshot();
      return {
        day: s.day.toISOString(),
        balanceP10: s.balanceP10.toFixed(2),
        balanceP50: s.balanceP50.toFixed(2),
        balanceP90: s.balanceP90.toFixed(2),
        expectedInflow: s.expectedInflow.toFixed(2),
        expectedOutflow: s.expectedOutflow.toFixed(2),
        hasDeficitRisk: s.hasDeficitRisk,
      };
    }),
    assumptions: p.assumptions,
    deficitWindows: p.detectDeficitWindows().map((w) => ({
      start: w.start.toISOString(),
      end: w.end.toISOString(),
      worstDay: w.worstDay.toISOString(),
      worstAmount: w.worstAmount,
      confidence: w.confidence,
    })),
  };
}

@ApiTags('cashflow')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('cashflow')
export class CashflowController {
  constructor(private readonly service: CashflowService) {}

  @Get('latest')
  async getLatest(@CurrentUser() user: AuthenticatedUser): Promise<ProjectionResponse | null> {
    const projection = await this.service.getLatest(user.id);
    return projection ? mapProjection(projection) : null;
  }

  @Get('projections/:id')
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProjectionResponse> {
    const p = await this.service.getById(user.id, id);
    return mapProjection(p);
  }

  @Get('history')
  async listHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const items = await this.service.listHistory(user.id, Number(limit ?? 10));
    return items.map((p) => ({
      id: p.id,
      generatedAt: p.generatedAt.toISOString(),
      horizonDays: p.horizonDays,
      modelVersion: p.modelVersion,
      confidenceScore: p.confidenceScore,
      isLatest: p.isLatest,
    }));
  }

  @Get('deficits')
  async listDeficits(@CurrentUser() user: AuthenticatedUser) {
    const items = await this.service.listOpenDeficits(user.id);
    return items.map((d) => ({
      id: d.id,
      predictedFor: d.predictedFor.toISOString(),
      estimatedAmount: d.estimatedAmount.toFixed(2),
      confidence: d.confidence,
    }));
  }

  @Post('refresh')
  async refresh(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RefreshForecastDto,
  ) {
    const result = await this.service.refreshNow({
      userId: user.id,
      horizonDays: dto.horizonDays,
      trials: dto.trials,
      seed: dto.seed,
    });
    if (!result.projection) throw new NotFoundException('Forecast failed');
    return {
      projection: mapProjection(result.projection),
      trialsRun: result.trialsRun,
      deficitProbability: result.deficitProbability,
    };
  }
}
