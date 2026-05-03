// ── Severity / type of each insight ────────────────────────────────────────
export type InsightType =
  | 'anomaly'           // one-off anomalous transaction
  | 'category_spike'    // sharp growth in a category vs previous period
  | 'unusual_purchase'  // purchase in a category the user rarely uses
  | 'conclusion';       // auto-generated textual financial takeaway

export type InsightSeverity = 'info' | 'warning' | 'critical';

// ── Single insight card ───────────────────────────────────────────────────
export interface Insight {
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  /** ISO date of the event or period end */
  date: string;
  /** Related data for frontend rendering */
  meta: Record<string, unknown>;
}

// ── Anomalous transaction ─────────────────────────────────────────────────
export interface AnomalyRow {
  id: string;
  merchant: string;
  category: string | null;
  amount: string;
  transaction_time: Date;
  avg_amount: string;
  std_amount: string;
  z_score: number;
}

// ── Category spike (period-over-period) ───────────────────────────────────
export interface CategorySpikeRow {
  category: string;
  current_total: string;
  previous_total: string;
  change_pct: number;
  current_count: number;
  previous_count: number;
}

// ── Unusual purchase (rare category) ──────────────────────────────────────
export interface UnusualPurchaseRow {
  id: string;
  merchant: string;
  category: string;
  amount: string;
  transaction_time: Date;
  category_lifetime_count: number;
  category_lifetime_total: string;
}

// ── Aggregated response ───────────────────────────────────────────────────
export interface InsightsResponse {
  insights: Insight[];
  generatedAt: string;
  period: { from: string; to: string };
}
