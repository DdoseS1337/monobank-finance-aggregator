import { ProjectionPoint } from './value-objects/projection-point.vo';

export interface ProjectionAssumption {
  key: string;
  value: unknown;
  source: 'historical' | 'recurring' | 'goal' | 'manual';
}

export interface CashFlowProjectionProps {
  id: string;
  userId: string;
  horizonDays: number;
  generatedAt: Date;
  modelVersion: string;
  confidenceScore: number | null;
  isLatest: boolean;
  points: ProjectionPoint[];
  assumptions: ProjectionAssumption[];
}

export interface DeficitWindow {
  start: Date;
  end: Date;
  worstDay: Date;
  worstAmount: number; // negative
  confidence: number;  // probability of deficit at worst point
}

export class CashFlowProjection {
  private constructor(private props: CashFlowProjectionProps) {}

  static rehydrate(props: CashFlowProjectionProps): CashFlowProjection {
    return new CashFlowProjection(props);
  }

  static create(input: Omit<CashFlowProjectionProps, 'isLatest'> & { isLatest?: boolean }): CashFlowProjection {
    return new CashFlowProjection({ ...input, isLatest: input.isLatest ?? true });
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get horizonDays(): number {
    return this.props.horizonDays;
  }
  get generatedAt(): Date {
    return this.props.generatedAt;
  }
  get modelVersion(): string {
    return this.props.modelVersion;
  }
  get confidenceScore(): number | null {
    return this.props.confidenceScore;
  }
  get points(): ProjectionPoint[] {
    return [...this.props.points];
  }
  get assumptions(): ProjectionAssumption[] {
    return [...this.props.assumptions];
  }
  get isLatest(): boolean {
    return this.props.isLatest;
  }

  /**
   * Detect contiguous spans where the median (P50) trajectory dips below
   * `threshold`. Returns one window per such span — the worstDay is the
   * point with the most negative balance and `confidence` is the proportion
   * of trajectories that go negative at the worst point (P50 ≤ 0 → ≥ 50%
   * probability of deficit).
   */
  detectDeficitWindows(threshold = 0): DeficitWindow[] {
    const windows: DeficitWindow[] = [];
    let openWindow: { start: Date; worstDay: Date; worstAmount: number; pointsInWindow: ProjectionPoint[] } | null = null;

    for (const point of this.props.points) {
      const median = Number(point.p50);
      if (median <= threshold) {
        if (!openWindow) {
          openWindow = {
            start: point.day,
            worstDay: point.day,
            worstAmount: median,
            pointsInWindow: [point],
          };
        } else {
          openWindow.pointsInWindow.push(point);
          if (median < openWindow.worstAmount) {
            openWindow.worstDay = point.day;
            openWindow.worstAmount = median;
          }
        }
      } else if (openWindow) {
        windows.push(this.closeWindow(openWindow));
        openWindow = null;
      }
    }
    if (openWindow) windows.push(this.closeWindow(openWindow));
    return windows;
  }

  private closeWindow(open: {
    start: Date;
    worstDay: Date;
    worstAmount: number;
    pointsInWindow: ProjectionPoint[];
  }): DeficitWindow {
    const last = open.pointsInWindow[open.pointsInWindow.length - 1]!;
    const worstPoint = open.pointsInWindow.find((p) => p.day.getTime() === open.worstDay.getTime())!;
    // Confidence = proportion of trajectories that dipped negative at worstDay.
    // We can't know that exactly post-hoc, but we approximate it from
    // (P50 - P10) / (P90 - P10) — if P10 < 0 we estimate the share.
    const p10 = Number(worstPoint.p10);
    const p50 = Number(worstPoint.p50);
    const p90 = Number(worstPoint.p90);
    const range = p90 - p10;
    const confidence = range > 0
      ? Math.max(0, Math.min(1, (0 - p10) / range))
      : (p50 <= 0 ? 1 : 0);
    return {
      start: open.start,
      end: last.day,
      worstDay: open.worstDay,
      worstAmount: open.worstAmount,
      confidence,
    };
  }

  toSnapshot(): CashFlowProjectionProps {
    return {
      ...this.props,
      points: [...this.props.points],
      assumptions: [...this.props.assumptions],
    };
  }
}
