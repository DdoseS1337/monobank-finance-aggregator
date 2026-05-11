/**
 * Event routing table — maps domain event types to BullMQ queue destinations.
 * See docs/06-BACKGROUND-JOBS.md §9.
 */
export const EVENT_ROUTING: Record<string, string[]> = {
  // Transactions
  'transaction.imported': ['categorization', 'embeddings'],
  'transaction.categorized': ['budgets', 'insights', 'subscriptions', 'rules'],
  'transaction.recategorized': ['budgets', 'insights'],
  'transaction.flagged-as-anomaly': ['recommendations', 'notifications'],

  // Budgeting
  'budget.created': ['forecasting'],
  'budget.period.started': ['budgets'],
  'budget.line.exceeded.warning': ['recommendations', 'notifications'],
  'budget.line.exceeded.critical': ['recommendations', 'notifications'],
  'budget.period.closed': ['budgets', 'insights'],
  'envelope.rebalanced': ['insights'],
  'envelope.overdrawn': ['recommendations', 'notifications'],

  // Goals
  'goal.created': ['forecasting', 'ai-memory'],
  'goal.contribution.made': ['forecasting', 'notifications'],
  'goal.milestone.reached': ['notifications'],
  'goal.at-risk': ['recommendations', 'notifications'],
  'goal.completed': ['notifications', 'ai-memory'],
  'goal.deadline.missed': ['recommendations', 'notifications'],
  'goal.abandoned': ['ai-memory'],

  // Cashflow
  'cashflow.projection.updated': ['recommendations'],
  'cashflow.deficit.predicted': ['recommendations', 'notifications', 'rules'],
  'cashflow.surplus.predicted': ['recommendations'],
  'cashflow.scenario.simulated': [],

  // Recommendations
  'recommendation.generated': ['notifications'],
  'recommendation.delivered': [],
  'recommendation.accepted': ['recommendations'],
  'recommendation.rejected': ['recommendations'],
  'recommendation.snoozed': ['recommendations'],
  'recommendation.modified': ['recommendations'],
  'recommendation.expired': [],

  // AI
  'agent.session.started': [],
  'agent.session.ended': ['ai-memory'],
  'tool.invoked': [],
  'memory.written': [],
  'memory.consolidated': [],

  // Rules
  'rule.triggered': [],
  'rule.executed': [],
  'rule.failed': [],
  'rule.conflict': [],
  'rule.notification.requested': ['notifications'],
  'rule.recommendation.requested': ['recommendations'],

  // Notifications
  'notification.queued': ['notifications'],
  'notification.delivered': [],
};

export function resolveDestinations(eventType: string): string[] {
  return EVENT_ROUTING[eventType] ?? [];
}
