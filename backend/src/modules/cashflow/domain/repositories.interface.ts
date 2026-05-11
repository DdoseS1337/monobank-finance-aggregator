import { CashFlowProjection } from './projection.entity';
import { Scenario } from './scenario.entity';

export const PROJECTION_REPOSITORY = Symbol('ProjectionRepository');
export const SCENARIO_REPOSITORY = Symbol('ScenarioRepository');

export interface ProjectionRepository {
  /**
   * Atomically:
   *   1. Marks the previous "isLatest" row for `userId` as historical.
   *   2. Inserts the new projection + points.
   *   3. Publishes the cashflow.projection.updated event.
   */
  saveAsLatest(projection: CashFlowProjection): Promise<void>;
  findLatest(userId: string): Promise<CashFlowProjection | null>;
  findById(id: string): Promise<CashFlowProjection | null>;
  listHistory(userId: string, limit: number): Promise<CashFlowProjection[]>;

  // Deficit predictions are denormalized rows for fast lookups.
  recordDeficit(input: {
    userId: string;
    projectionId: string;
    predictedFor: Date;
    estimatedAmount: number;
    confidence: number;
  }): Promise<void>;

  listOpenDeficits(userId: string): Promise<
    Array<{ id: string; predictedFor: Date; estimatedAmount: number; confidence: number }>
  >;
}

export interface ScenarioRepository {
  save(scenario: Scenario): Promise<void>;
  findById(id: string): Promise<Scenario | null>;
  findByUser(userId: string): Promise<Scenario[]>;
  delete(id: string): Promise<void>;
}
