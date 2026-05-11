import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../../auth/supabase.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../auth/current-user.decorator';
import { ScenariosService } from '../application/scenarios.service';
import { Scenario, ScenarioVariableKind } from '../domain/scenario.entity';
import { CreateScenarioDto } from './dto/cashflow-dto';

interface ScenarioResponse {
  id: string;
  name: string;
  baselineProjectionId: string | null;
  variables: ScenarioVariableKind[];
  outcomes: Array<{
    metricKey: string;
    baseline: number;
    modified: number;
    delta: number;
    deltaPct: number;
  }> | null;
  computedAt: string | null;
}

function mapScenario(s: Scenario): ScenarioResponse {
  return {
    id: s.id,
    name: s.name,
    baselineProjectionId: s.baselineProjectionId,
    variables: s.variables,
    outcomes: s.outcomes,
    computedAt: s.computedAt?.toISOString() ?? null,
  };
}

@ApiTags('scenarios')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly service: ScenariosService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateScenarioDto,
  ): Promise<ScenarioResponse> {
    const scenario = await this.service.create({
      userId: user.id,
      name: dto.name,
      variables: dto.variables as ScenarioVariableKind[],
      baselineProjectionId: dto.baselineProjectionId,
      runNow: dto.runNow,
    });
    return mapScenario(scenario);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ScenarioResponse[]> {
    const scenarios = await this.service.list(user.id);
    return scenarios.map(mapScenario);
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ScenarioResponse> {
    const scenario = await this.service.getOne(user.id, id);
    return mapScenario(scenario);
  }

  @Post(':id/resimulate')
  async resimulate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ScenarioResponse> {
    const scenario = await this.service.resimulate(user.id, id);
    return mapScenario(scenario);
  }

  @Delete(':id')
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.service.delete(user.id, id);
    return { ok: true };
  }
}
