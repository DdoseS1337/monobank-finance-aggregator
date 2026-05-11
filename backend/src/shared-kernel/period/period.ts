import dayjs, { Dayjs } from 'dayjs';

export class Period {
  private constructor(
    public readonly start: Date,
    public readonly end: Date,
  ) {
    if (start > end) {
      throw new Error('Period start must be before or equal to end');
    }
  }

  static of(start: Date | string, end: Date | string): Period {
    return new Period(new Date(start), new Date(end));
  }

  static currentMonth(): Period {
    const now = dayjs();
    return new Period(now.startOf('month').toDate(), now.endOf('month').toDate());
  }

  static currentWeek(): Period {
    const now = dayjs();
    return new Period(now.startOf('week').toDate(), now.endOf('week').toDate());
  }

  static lastNDays(n: number): Period {
    const now = dayjs();
    return new Period(now.subtract(n, 'day').toDate(), now.toDate());
  }

  static nextNDays(n: number): Period {
    const now = dayjs();
    return new Period(now.toDate(), now.add(n, 'day').toDate());
  }

  contains(date: Date): boolean {
    return date >= this.start && date <= this.end;
  }

  overlaps(other: Period): boolean {
    return this.start <= other.end && other.start <= this.end;
  }

  durationDays(): number {
    return dayjs(this.end).diff(this.start, 'day');
  }

  durationMs(): number {
    return this.end.getTime() - this.start.getTime();
  }

  elapsedRatio(at: Date = new Date()): number {
    if (at <= this.start) return 0;
    if (at >= this.end) return 1;
    const total = this.durationMs();
    if (total === 0) return 1;
    return (at.getTime() - this.start.getTime()) / total;
  }

  shift(days: number): Period {
    return new Period(
      dayjs(this.start).add(days, 'day').toDate(),
      dayjs(this.end).add(days, 'day').toDate(),
    );
  }

  toJSON(): { start: string; end: string } {
    return { start: this.start.toISOString(), end: this.end.toISOString() };
  }

  toString(): string {
    return `[${this.start.toISOString()} → ${this.end.toISOString()}]`;
  }

  startDayjs(): Dayjs {
    return dayjs(this.start);
  }

  endDayjs(): Dayjs {
    return dayjs(this.end);
  }
}
