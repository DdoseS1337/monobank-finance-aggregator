import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CashFlowProjection } from '../domain/projection.entity';
import {
  PROJECTION_REPOSITORY,
  ProjectionRepository,
} from '../domain/repositories.interface';
import { ForecastPipeline } from './forecasting/forecast-pipeline.service';

@Injectable()
export class CashflowService {
  constructor(
    @Inject(PROJECTION_REPOSITORY)
    private readonly projections: ProjectionRepository,
    private readonly pipeline: ForecastPipeline,
  ) {}

  async getLatest(userId: string): Promise<CashFlowProjection | null> {
    return this.projections.findLatest(userId);
  }

  async getById(userId: string, id: string): Promise<CashFlowProjection> {
    const projection = await this.projections.findById(id);
    if (!projection || projection.userId !== userId) {
      throw new NotFoundException(`Projection ${id} not found`);
    }
    return projection;
  }

  async listHistory(userId: string, limit = 10): Promise<CashFlowProjection[]> {
    return this.projections.listHistory(userId, Math.min(limit, 100));
  }

  async listOpenDeficits(userId: string) {
    return this.projections.listOpenDeficits(userId);
  }

  async refreshNow(input: {
    userId: string;
    horizonDays?: number;
    trials?: number;
    seed?: number;
  }) {
    return this.pipeline.run(input);
  }
}
