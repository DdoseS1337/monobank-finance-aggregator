export const QUEUE_NAMES = {
  transactions: 'transactions',
  categorization: 'categorization',
  insights: 'insights',
  subscriptions: 'subscriptions',
  budgets: 'budgets',
  forecasting: 'forecasting',
  recommendations: 'recommendations',
  rules: 'rules',
  notifications: 'notifications',
  aiMemory: 'ai-memory',
  embeddings: 'embeddings',
  analyticsRollups: 'analytics-rollups',
  outboxRelay: 'outbox-relay',
  dlq: 'dlq',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUE_NAMES: QueueName[] = Object.values(QUEUE_NAMES);
