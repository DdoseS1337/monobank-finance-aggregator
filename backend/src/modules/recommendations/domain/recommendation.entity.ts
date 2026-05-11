import { randomUUID } from 'crypto';
import { RankingScore } from './value-objects/ranking-score.vo';

export type RecommendationKind =
  | 'SPENDING'
  | 'SAVING'
  | 'SUBSCRIPTION'
  | 'BUDGET'
  | 'GOAL'
  | 'CASHFLOW'
  | 'BEHAVIORAL';

export type RecommendationStatus =
  | 'PENDING'
  | 'DELIVERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'MODIFIED'
  | 'SNOOZED'
  | 'EXPIRED';

export type GeneratedBy = 'rules' | 'ml' | 'llm' | 'hybrid';

export interface ExpectedImpact {
  financial: { amount: string; currency: string } | null;
  timeframe: string | null; // e.g. "30d"
  description: string;
}

export interface RecommendationActionSpec {
  actionType: string;
  targetRef: string | null;
  params: Record<string, unknown>;
  sequenceOrder: number;
}

export interface RecommendationProps {
  id: string;
  userId: string;
  kind: RecommendationKind;
  priority: number;
  generatedBy: GeneratedBy;
  generatorMetadata: Record<string, unknown>;
  generatedAt: Date;
  validUntil: Date | null;
  status: RecommendationStatus;
  payload: Record<string, unknown>;
  explanation: string;
  expectedImpact: ExpectedImpact | null;
  embedding: Float32Array | null;
  ranking: RankingScore | null;
  actions: RecommendationActionSpec[];
  deliveredAt: Date | null;
  deliveredVia: string | null;
}

export class Recommendation {
  private constructor(private props: RecommendationProps) {}

  static rehydrate(props: RecommendationProps): Recommendation {
    return new Recommendation(props);
  }

  static create(input: {
    userId: string;
    kind: RecommendationKind;
    priority?: number;
    generatedBy: GeneratedBy;
    generatorMetadata?: Record<string, unknown>;
    payload: Record<string, unknown>;
    explanation: string;
    expectedImpact?: ExpectedImpact;
    actions?: RecommendationActionSpec[];
    validForMs?: number;
    embedding?: Float32Array | null;
  }): Recommendation {
    if (!input.explanation.trim()) {
      throw new Error('Recommendation explanation required');
    }
    const validUntil = input.validForMs
      ? new Date(Date.now() + input.validForMs)
      : null;
    return new Recommendation({
      id: randomUUID(),
      userId: input.userId,
      kind: input.kind,
      priority: input.priority ?? 3,
      generatedBy: input.generatedBy,
      generatorMetadata: input.generatorMetadata ?? {},
      generatedAt: new Date(),
      validUntil,
      status: 'PENDING',
      payload: input.payload,
      explanation: input.explanation.trim(),
      expectedImpact: input.expectedImpact ?? null,
      embedding: input.embedding ?? null,
      ranking: null,
      actions: input.actions ?? [],
      deliveredAt: null,
      deliveredVia: null,
    });
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get kind(): RecommendationKind {
    return this.props.kind;
  }
  get priority(): number {
    return this.props.priority;
  }
  get generatedBy(): GeneratedBy {
    return this.props.generatedBy;
  }
  get status(): RecommendationStatus {
    return this.props.status;
  }
  get payload(): Record<string, unknown> {
    return { ...this.props.payload };
  }
  get explanation(): string {
    return this.props.explanation;
  }
  get expectedImpact(): ExpectedImpact | null {
    return this.props.expectedImpact;
  }
  get ranking(): RankingScore | null {
    return this.props.ranking;
  }
  get actions(): RecommendationActionSpec[] {
    return [...this.props.actions];
  }
  get embedding(): Float32Array | null {
    return this.props.embedding;
  }
  get validUntil(): Date | null {
    return this.props.validUntil;
  }
  get generatedAt(): Date {
    return this.props.generatedAt;
  }
  get deliveredAt(): Date | null {
    return this.props.deliveredAt;
  }

  isExpired(at: Date = new Date()): boolean {
    return this.props.validUntil !== null && at >= this.props.validUntil;
  }

  setRanking(ranking: RankingScore): void {
    this.props.ranking = ranking;
  }

  markDelivered(channel: string, at: Date = new Date()): void {
    this.props.status = 'DELIVERED';
    this.props.deliveredAt = at;
    this.props.deliveredVia = channel;
  }

  recordDecision(decision: Extract<RecommendationStatus, 'ACCEPTED' | 'REJECTED' | 'MODIFIED' | 'SNOOZED' | 'EXPIRED'>): void {
    this.props.status = decision;
  }

  toSnapshot(): RecommendationProps {
    return {
      ...this.props,
      payload: { ...this.props.payload },
      generatorMetadata: { ...this.props.generatorMetadata },
      actions: [...this.props.actions],
    };
  }
}
