import {
  Body,
  Controller,
  Get,
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
import { Recommendation } from '../domain/recommendation.entity';
import { RecommendationsService } from '../application/recommendations.service';
import { RecommendationPipeline } from '../application/pipeline/pipeline.service';
import {
  FeedbackDto,
  ListRecommendationsQueryDto,
} from './dto/recommendations-dto';

interface RecommendationResponse {
  id: string;
  kind: string;
  priority: number;
  generatedBy: string;
  generatedAt: string;
  validUntil: string | null;
  status: string;
  explanation: string;
  payload: unknown;
  expectedImpact: unknown;
  ranking: unknown;
  actions: unknown;
  deliveredAt: string | null;
}

function mapRec(r: Recommendation): RecommendationResponse {
  return {
    id: r.id,
    kind: r.kind,
    priority: r.priority,
    generatedBy: r.generatedBy,
    generatedAt: r.generatedAt.toISOString(),
    validUntil: r.validUntil?.toISOString() ?? null,
    status: r.status,
    explanation: r.explanation,
    payload: r.payload,
    expectedImpact: r.expectedImpact,
    ranking: r.ranking?.toJSON() ?? null,
    actions: r.actions,
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
  };
}

@ApiTags('recommendations')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly service: RecommendationsService,
    private readonly pipeline: RecommendationPipeline,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRecommendationsQueryDto,
  ): Promise<RecommendationResponse[]> {
    const items = await this.service.list(user.id, {
      status: query.status,
      kinds: query.kinds,
      validOnly: query.validOnly,
      limit: query.limit,
    });
    return items.map(mapRec);
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RecommendationResponse> {
    const rec = await this.service.getOne(user.id, id);
    return mapRec(rec);
  }

  @Post(':id/accept')
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FeedbackDto,
  ): Promise<RecommendationResponse> {
    const rec = await this.service.accept(user.id, id, dto.feedbackText);
    return mapRec(rec);
  }

  @Post(':id/reject')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FeedbackDto,
  ): Promise<RecommendationResponse> {
    const rec = await this.service.reject(user.id, id, dto.feedbackText);
    return mapRec(rec);
  }

  @Post(':id/snooze')
  async snooze(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FeedbackDto,
  ): Promise<RecommendationResponse> {
    const rec = await this.service.snooze(user.id, id, dto.snoozeHours ?? 24);
    return mapRec(rec);
  }

  @Post('refresh')
  async refresh(@CurrentUser() user: AuthenticatedUser) {
    return this.pipeline.run(user.id);
  }
}
