import { randomUUID } from 'crypto';

export type Channel = 'in_app' | 'email' | 'push' | 'telegram';
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface NotificationProps {
  id: string;
  userId: string;
  channel: Channel;
  kind: string;
  severity: Severity;
  payload: Record<string, unknown>;
  scheduledFor: Date;
  sentAt: Date | null;
  status: NotificationStatus;
  dedupKey: string | null;
  recommendationId: string | null;
  retryCount: number;
  error: string | null;
}

const MAX_RETRY = 5;

export class Notification {
  private constructor(private props: NotificationProps) {}

  static rehydrate(props: NotificationProps): Notification {
    return new Notification(props);
  }

  static create(input: {
    userId: string;
    channel: Channel;
    kind: string;
    severity?: Severity;
    payload: Record<string, unknown>;
    scheduledFor?: Date;
    dedupKey?: string;
    recommendationId?: string;
  }): Notification {
    return new Notification({
      id: randomUUID(),
      userId: input.userId,
      channel: input.channel,
      kind: input.kind,
      severity: input.severity ?? 'INFO',
      payload: input.payload,
      scheduledFor: input.scheduledFor ?? new Date(),
      sentAt: null,
      status: 'PENDING',
      dedupKey: input.dedupKey ?? null,
      recommendationId: input.recommendationId ?? null,
      retryCount: 0,
      error: null,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get channel(): Channel {
    return this.props.channel;
  }
  get kind(): string {
    return this.props.kind;
  }
  get severity(): Severity {
    return this.props.severity;
  }
  get payload(): Record<string, unknown> {
    return { ...this.props.payload };
  }
  get scheduledFor(): Date {
    return this.props.scheduledFor;
  }
  get status(): NotificationStatus {
    return this.props.status;
  }
  get dedupKey(): string | null {
    return this.props.dedupKey;
  }
  get retryCount(): number {
    return this.props.retryCount;
  }

  isReady(at: Date = new Date()): boolean {
    return this.props.status === 'PENDING' && this.props.scheduledFor <= at;
  }

  markSent(at: Date = new Date()): void {
    this.props.status = 'SENT';
    this.props.sentAt = at;
    this.props.error = null;
  }

  markFailed(error: string): void {
    this.props.retryCount += 1;
    this.props.error = error;
    this.props.status = this.props.retryCount >= MAX_RETRY ? 'FAILED' : 'PENDING';
  }

  markSkipped(reason: string): void {
    this.props.status = 'SKIPPED';
    this.props.error = reason;
    this.props.sentAt = new Date();
  }

  reschedule(when: Date): void {
    this.props.scheduledFor = when;
  }

  toSnapshot(): NotificationProps {
    return { ...this.props, payload: { ...this.props.payload } };
  }
}
