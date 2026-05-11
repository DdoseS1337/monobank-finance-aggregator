import { MonteCarloSimulator } from './monte-carlo-simulator.service';
import { DailyDistribution } from './historical-baseline.service';
import { RecurringFlow } from './recurring-detector.service';

const FIXED_SEED = 42;

const NEUTRAL_BASELINE: DailyDistribution = {
  meanByDow: [0, 0, 0, 0, 0, 0, 0],
  stdDaily: 0,
  meanInflowDaily: 0,
  stdInflowDaily: 0,
  observations: 100,
};

describe('MonteCarloSimulator', () => {
  const sim = new MonteCarloSimulator();

  it('produces one point per horizon day', () => {
    const out = sim.simulate({
      startingBalance: 10_000,
      horizonDays: 30,
      baseline: NEUTRAL_BASELINE,
      recurring: [],
      trials: 100,
      seed: FIXED_SEED,
    });
    expect(out.perDay).toHaveLength(30);
  });

  it('keeps balance flat when there is no income, no spending, and no recurring', () => {
    const out = sim.simulate({
      startingBalance: 5_000,
      horizonDays: 10,
      baseline: NEUTRAL_BASELINE,
      recurring: [],
      trials: 50,
      seed: FIXED_SEED,
    });
    out.perDay.forEach((d) => {
      expect(d.balanceP10).toBeCloseTo(5_000, 5);
      expect(d.balanceP50).toBeCloseTo(5_000, 5);
      expect(d.balanceP90).toBeCloseTo(5_000, 5);
    });
    expect(out.deficitProbability).toBe(0);
  });

  it('reproduces identical results given the same seed', () => {
    const args = {
      startingBalance: 1_000,
      horizonDays: 20,
      baseline: { ...NEUTRAL_BASELINE, meanByDow: [50, 50, 50, 50, 50, 50, 50], stdDaily: 30 },
      recurring: [] as RecurringFlow[],
      trials: 200,
      seed: 7,
    };
    const a = sim.simulate(args);
    const b = sim.simulate(args);
    expect(a.deficitProbability).toBe(b.deficitProbability);
    expect(a.perDay.map((d) => d.balanceP50)).toEqual(b.perDay.map((d) => d.balanceP50));
  });

  it('flags deficit probability when daily outflow > starting balance / horizon', () => {
    const out = sim.simulate({
      startingBalance: 100,
      horizonDays: 30,
      baseline: { ...NEUTRAL_BASELINE, meanByDow: [50, 50, 50, 50, 50, 50, 50], stdDaily: 5 },
      recurring: [],
      trials: 200,
      seed: FIXED_SEED,
    });
    expect(out.deficitProbability).toBeGreaterThan(0.9);
  });

  it('preserves percentile ordering: P10 ≤ P50 ≤ P90', () => {
    const out = sim.simulate({
      startingBalance: 5_000,
      horizonDays: 30,
      baseline: { ...NEUTRAL_BASELINE, meanByDow: [100, 80, 60, 40, 50, 70, 90], stdDaily: 40 },
      recurring: [],
      trials: 500,
      seed: FIXED_SEED,
    });
    out.perDay.forEach((d) => {
      expect(d.balanceP10).toBeLessThanOrEqual(d.balanceP50);
      expect(d.balanceP50).toBeLessThanOrEqual(d.balanceP90);
    });
  });

  it('applies recurring inflow on the deterministic schedule', () => {
    const recurring: RecurringFlow[] = [
      {
        description: 'salary',
        amountMonthly: 30_000,
        sign: 'INFLOW',
        source: 'salary',
        nextDueDate: null,
        cadence: 'monthly',
      },
    ];
    const withSalary = sim.simulate({
      startingBalance: 0,
      horizonDays: 30,
      baseline: NEUTRAL_BASELINE,
      recurring,
      trials: 100,
      seed: FIXED_SEED,
    });
    // Spread monthly amount evenly when no due date is given.
    expect(withSalary.expectedEndBalance).toBeGreaterThan(20_000);
  });
});
