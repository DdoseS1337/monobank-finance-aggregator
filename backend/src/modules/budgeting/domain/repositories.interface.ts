import { Budget } from './budget.entity';
import { Envelope } from './envelope.entity';

export const BUDGET_REPOSITORY = Symbol('BudgetRepository');
export const ENVELOPE_REPOSITORY = Symbol('EnvelopeRepository');

export interface BudgetRepository {
  save(budget: Budget): Promise<void>;
  findById(id: string): Promise<Budget | null>;
  findByUser(userId: string, opts?: { includeArchived?: boolean }): Promise<Budget[]>;
  findActiveForCategory(userId: string, categoryId: string): Promise<Budget | null>;
  /** Returns an active budget that has a line for any of the given category ids. */
  findActiveForCategories(
    userId: string,
    categoryIds: string[],
  ): Promise<Budget | null>;
}

export interface EnvelopeRepository {
  save(envelope: Envelope): Promise<void>;
  saveMovement(movement: {
    envelopeId: string;
    amount: string;
    direction: 'IN' | 'OUT' | 'TRANSFER';
    sourceType: string;
    sourceRef: string | null;
    relatedEnvelopeId: string | null;
    occurredAt: Date;
  }): Promise<void>;
  findById(id: string): Promise<Envelope | null>;
  findByUser(userId: string, opts?: { includeArchived?: boolean }): Promise<Envelope[]>;
}
