import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';
import { BehavioralTraits } from '../domain/user-profile.entity';

const WINDOW_DAYS = 90;
const MIN_OBSERVATIONS = 20;
const EVENING_HOURS = new Set([18, 19, 20, 21, 22, 23, 0, 1]);

/**
 * Computes a small set of behavioral traits from the last 90 days of
 * transactions. Run nightly per active user.
 *
 * Output features:
 *   - eveningSpenderScore : share of debit volume in 18:00–01:59
 *   - weekendSpenderScore : share of debit volume on Sat/Sun
 *   - impulsivityScore    : coefficient of variation of daily debit total
 *                           (clamped to [0, 1])
 *   - plannerScore        : share of debit volume marked as recurring
 *   - segment             : coarse cluster derived from the four scores
 *
 * For Phase 5.2 this is deliberately a simple deterministic model. Phase 7
 * (eval) can swap in K-means with feature_vectors stored in `user_profiles.embedding`.
 */
@Injectable()
export class BehaviorModelerService {
  constructor(private readonly prisma: PrismaService) {}

  async computeFor(userId: string): Promise<BehavioralTraits> {
    const since = dayjs().subtract(WINDOW_DAYS, 'day').startOf('day').toDate();
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: 'DEBIT',
        transactionDate: { gte: since },
      },
      select: { amount: true, transactionDate: true, isRecurring: true },
    });
    if (rows.length === 0) {
      return {
        eveningSpenderScore: 0,
        weekendSpenderScore: 0,
        impulsivityScore: 0,
        plannerScore: 0,
        segment: 'COLD_START',
        observations: 0,
        computedAt: new Date().toISOString(),
      };
    }

    let totalAmount = 0;
    let eveningAmount = 0;
    let weekendAmount = 0;
    let recurringAmount = 0;
    const dailyTotals = new Map<string, number>();

    for (const row of rows) {
      const amt = Number(row.amount);
      totalAmount += amt;
      const dt = dayjs(row.transactionDate);
      if (EVENING_HOURS.has(dt.hour())) eveningAmount += amt;
      const dow = dt.day();
      if (dow === 0 || dow === 6) weekendAmount += amt;
      if (row.isRecurring) recurringAmount += amt;
      const key = dt.format('YYYY-MM-DD');
      dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + amt);
    }

    const dailyArray = [...dailyTotals.values()];
    const meanDaily = dailyArray.reduce((s, v) => s + v, 0) / dailyArray.length;
    const variance =
      dailyArray.reduce((s, v) => s + (v - meanDaily) ** 2, 0) /
      Math.max(1, dailyArray.length - 1);
    const stdDaily = Math.sqrt(variance);
    const cv = meanDaily > 0 ? stdDaily / meanDaily : 0;

    const traits: BehavioralTraits = {
      eveningSpenderScore: round(eveningAmount / totalAmount),
      weekendSpenderScore: round(weekendAmount / totalAmount),
      impulsivityScore: round(Math.min(1, cv)),
      plannerScore: round(recurringAmount / totalAmount),
      segment: this.deriveSegment(eveningAmount / totalAmount, recurringAmount / totalAmount, cv),
      observations: rows.length,
      computedAt: new Date().toISOString(),
    };

    return rows.length >= MIN_OBSERVATIONS
      ? traits
      : { ...traits, segment: 'COLD_START' };
  }

  /**
   * Coarse rule-based segmentation. Easy to defend academically and
   * trivially replaceable with K-means once we have enough users.
   */
  private deriveSegment(eveningRatio: number, plannedRatio: number, cv: number): string {
    if (plannedRatio > 0.5 && cv < 0.4) return 'METHODICAL_PLANNER';
    if (eveningRatio > 0.4 && cv > 0.6) return 'IMPULSIVE_EVENING';
    if (plannedRatio < 0.2 && cv > 0.7) return 'CHAOTIC_SPENDER';
    if (plannedRatio > 0.4 && cv >= 0.4) return 'BALANCED_REGULAR';
    return 'EXPLORING';
  }
}

function round(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(3));
}
