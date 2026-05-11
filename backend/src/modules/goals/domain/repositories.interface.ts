import { Goal } from './goal.entity';

export const GOAL_REPOSITORY = Symbol('GoalRepository');

export interface GoalRepository {
  save(goal: Goal): Promise<void>;
  findById(id: string): Promise<Goal | null>;
  findByUser(
    userId: string,
    opts?: { statuses?: ReadonlyArray<'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED'> },
  ): Promise<Goal[]>;
  findActiveByUser(userId: string): Promise<Goal[]>;
}
