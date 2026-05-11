import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import { DailyDistribution } from './historical-baseline.service';
import { RecurringFlow } from './recurring-detector.service';

export interface SimulationInput {
  startingBalance: number;
  horizonDays: number;
  baseline: DailyDistribution;
  recurring: RecurringFlow[];
  trials?: number; // default 1000
  seed?: number;
}

export interface SimulationDayResult {
  day: Date;
  balanceP10: number;
  balanceP50: number;
  balanceP90: number;
  expectedInflow: number;
  expectedOutflow: number;
}

export interface SimulationOutput {
  perDay: SimulationDayResult[];
  trialsRun: number;
  expectedEndBalance: number;
  /** Probability that balance drops below 0 at least once during horizon. */
  deficitProbability: number;
}

/**
 * Monte Carlo simulation over `trials` independent trajectories.
 *
 *   For each day d in horizon:
 *     deterministic[d] = sum of recurring flows scheduled for d
 *     stochastic_outflow[d] = sample from Normal(meanByDow[dow], stdDaily)
 *                              clamped to ≥ 0
 *     stochastic_inflow[d]  = sample from Normal(meanInflowDaily, stdInflowDaily)
 *                              clamped to ≥ 0
 *     balance[d] = balance[d-1] + deterministic[d] + stochastic_inflow[d]
 *                                                  − stochastic_outflow[d]
 *
 * We then sort trajectories per day to extract P10/P50/P90.
 *
 * Random source: deterministic Mulberry32 PRNG seeded by `seed` (or epoch),
 * so simulations are reproducible.
 */
@Injectable()
export class MonteCarloSimulator {
  simulate(input: SimulationInput): SimulationOutput {
    const trials = input.trials ?? 1000;
    const horizon = input.horizonDays;
    const rand = mulberry32(input.seed ?? Date.now() & 0xffffffff);

    const recurringByDay = this.scheduleRecurring(input.recurring, horizon);

    // trajectories[trial][day] = balance
    const trajectories: number[][] = Array.from({ length: trials }, () => new Array(horizon));
    let deficitTrials = 0;

    for (let t = 0; t < trials; t++) {
      let balance = input.startingBalance;
      let dippedNegative = false;
      for (let d = 0; d < horizon; d++) {
        const dow = (dayjs().add(d + 1, 'day').day()) % 7;
        const meanOut = input.baseline.meanByDow[dow] ?? 0;
        const stochOut = Math.max(
          0,
          sampleNormal(rand, meanOut, input.baseline.stdDaily),
        );
        const stochIn = Math.max(
          0,
          sampleNormal(rand, input.baseline.meanInflowDaily, input.baseline.stdInflowDaily),
        );
        const recurring = recurringByDay[d] ?? 0;
        balance += recurring + stochIn - stochOut;
        trajectories[t]![d] = balance;
        if (balance < 0) dippedNegative = true;
      }
      if (dippedNegative) deficitTrials++;
    }

    const perDay: SimulationDayResult[] = [];
    for (let d = 0; d < horizon; d++) {
      const sorted = trajectories.map((tr) => tr[d]!).sort((a, b) => a - b);
      const day = dayjs().add(d + 1, 'day').startOf('day').toDate();
      const dow = day.getDay();
      perDay.push({
        day,
        balanceP10: sorted[Math.floor(0.1 * trials)] ?? 0,
        balanceP50: sorted[Math.floor(0.5 * trials)] ?? 0,
        balanceP90: sorted[Math.floor(0.9 * trials)] ?? 0,
        expectedInflow: input.baseline.meanInflowDaily,
        expectedOutflow:
          (input.baseline.meanByDow[dow] ?? 0) +
          Math.max(0, -(recurringByDay[d] ?? 0)),
      });
    }

    return {
      perDay,
      trialsRun: trials,
      expectedEndBalance: perDay.length > 0 ? perDay[perDay.length - 1]!.balanceP50 : input.startingBalance,
      deficitProbability: deficitTrials / trials,
    };
  }

  private scheduleRecurring(flows: RecurringFlow[], horizonDays: number): number[] {
    const schedule = new Array(horizonDays).fill(0);
    for (const flow of flows) {
      const monthly = flow.amountMonthly;
      const sign = flow.sign === 'INFLOW' ? 1 : -1;

      if (flow.cadence === 'monthly') {
        // If we have a nextDueDate use it, otherwise spread per day amortized.
        if (flow.nextDueDate) {
          let d = dayjs(flow.nextDueDate).startOf('day');
          const horizonEnd = dayjs().add(horizonDays, 'day').startOf('day');
          while (d.isBefore(horizonEnd)) {
            const idx = d.diff(dayjs().startOf('day'), 'day') - 1;
            if (idx >= 0 && idx < horizonDays) {
              schedule[idx] += sign * monthly;
            }
            d = d.add(1, 'month');
          }
        } else {
          const dailyEquivalent = monthly / 30.44;
          for (let i = 0; i < horizonDays; i++) {
            schedule[i] += sign * dailyEquivalent;
          }
        }
      } else if (flow.cadence === 'weekly') {
        const weeklyAmount = monthly / 4.345;
        for (let i = 6; i < horizonDays; i += 7) schedule[i] += sign * weeklyAmount;
      } else if (flow.cadence === 'yearly') {
        // Approximate as a single hit at horizon midpoint, only if it falls inside the window.
        if (flow.nextDueDate) {
          const idx = dayjs(flow.nextDueDate).diff(dayjs().startOf('day'), 'day') - 1;
          if (idx >= 0 && idx < horizonDays) {
            schedule[idx] += sign * monthly * 12;
          }
        }
      }
    }
    return schedule;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(rand: () => number, mean: number, stddev: number): number {
  // Box-Muller transform; reuses one of the two outputs each call.
  const u1 = Math.max(rand(), Number.EPSILON);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

// Re-export Decimal so callers can interop with Money values without
// taking a direct dep on decimal.js from this layer.
export { Decimal };
