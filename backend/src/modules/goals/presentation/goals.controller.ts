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
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../auth/current-user.decorator';
import { GoalsService } from '../application/goals.service';
import {
  AbandonDto,
  AdjustDeadlineDto,
  AdjustPriorityDto,
  AdjustTargetDto,
  ContributeDto,
  CreateGoalDto,
} from './dto/create-goal.dto';
import { GoalMapper, GoalResponse } from './dto/goal-response.dto';

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGoalDto,
  ): Promise<GoalResponse> {
    const goal = await this.service.createGoal({
      userId: user.id,
      type: dto.type,
      name: dto.name,
      description: dto.description,
      targetAmount: dto.targetAmount,
      baseCurrency: dto.baseCurrency,
      deadline: dto.deadline,
      priority: dto.priority,
      fundingStrategy: dto.fundingStrategy,
      fundingParams: dto.fundingParams,
      linkedAccountId: dto.linkedAccountId,
    });
    return GoalMapper.toResponse(goal);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<GoalResponse[]> {
    const goals = await this.service.listGoals(
      user.id,
      includeInactive === 'true',
    );
    return goals.map((g) => GoalMapper.toResponse(g));
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<GoalResponse> {
    const goal = await this.service.getGoal(user.id, id);
    return GoalMapper.toResponse(goal);
  }

  @Post(':id/contributions')
  async contribute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ContributeDto,
  ): Promise<GoalResponse> {
    const goal = await this.service.contribute(user.id, {
      goalId: id,
      amount: dto.amount,
      sourceType: dto.sourceType,
      sourceRef: dto.sourceRef ?? null,
    });
    return GoalMapper.toResponse(goal);
  }

  @Patch(':id/target')
  async adjustTarget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdjustTargetDto,
  ): Promise<GoalResponse> {
    const goal = await this.service.adjustTarget(user.id, id, dto.newTarget);
    return GoalMapper.toResponse(goal);
  }

  @Patch(':id/deadline')
  async adjustDeadline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdjustDeadlineDto,
  ): Promise<GoalResponse> {
    const goal = await this.service.adjustDeadline(
      user.id,
      id,
      dto.newDeadline ?? null,
    );
    return GoalMapper.toResponse(goal);
  }

  @Patch(':id/priority')
  async adjustPriority(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdjustPriorityDto,
  ): Promise<GoalResponse> {
    const goal = await this.service.adjustPriority(user.id, id, dto.priority);
    return GoalMapper.toResponse(goal);
  }

  @Post(':id/pause')
  async pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<GoalResponse> {
    const goal = await this.service.pause(user.id, id);
    return GoalMapper.toResponse(goal);
  }

  @Post(':id/resume')
  async resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<GoalResponse> {
    const goal = await this.service.resume(user.id, id);
    return GoalMapper.toResponse(goal);
  }

  @Post(':id/feasibility/recalculate')
  async recalcFeasibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const { goal, score } = await this.service.recalculateFeasibility(
      user.id,
      id,
    );
    return {
      goal: GoalMapper.toResponse(goal),
      score,
    };
  }

  @Delete(':id')
  async abandon(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AbandonDto,
  ): Promise<GoalResponse> {
    const goal = await this.service.abandon(user.id, id, dto.reason);
    return GoalMapper.toResponse(goal);
  }
}
