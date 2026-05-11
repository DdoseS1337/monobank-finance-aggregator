/**
 * Empirical validation of the V3 causal decomposition algorithm.
 *
 * We synthesise pairs of period aggregations where we KNOW the true price /
 * volume / mix effects by construction, then verify that
 * `decomposeAggregations` recovers them within numerical tolerance.
 *
 * Output: console table + `eval/v3-validation.csv` for inclusion in the
 * thesis "Експериментальна перевірка" section.
 *
 *   npm --prefix backend run eval:decomp
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  decomposeAggregations,
  type RawAggregation,
} from '../src/modules/transactions/application/spending-decomposition.service';

interface Expected {
  priceEffect: number;
  volumeEffect: number;
  crossEffect: number;
  mixInEffect: number;
  mixOutEffect: number;
  delta: number;
}

interface Scenario {
  name: string;
  description: string;
  aggA: RawAggregation[];
  aggB: RawAggregation[];
  expected: Expected;
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build a "two periods, same merchant, price changed" scenario.
 * Expected: priceEffect = (avgB - avgA) * countA, volume/cross = 0.
 */
function pricePure(): Scenario {
  const aggA: RawAggregation[] = [{ key: 'mA', label: 'Merchant A', spend: 1000, txCount: 10 }];
  // 50% price up, same count.
  const aggB: RawAggregation[] = [{ key: 'mA', label: 'Merchant A', spend: 1500, txCount: 10 }];
  const avgA = 100;
  const avgB = 150;
  return {
    name: 'price-only',
    description: 'Same merchant, +50% avg ticket, same count.',
    aggA,
    aggB,
    expected: {
      priceEffect: (avgB - avgA) * 10,
      volumeEffect: 0,
      crossEffect: 0,
      mixInEffect: 0,
      mixOutEffect: 0,
      delta: 500,
    },
  };
}

function volumePure(): Scenario {
  const aggA: RawAggregation[] = [{ key: 'mA', label: 'Merchant A', spend: 1000, txCount: 10 }];
  // Same avg ticket 100, count up from 10 to 15.
  const aggB: RawAggregation[] = [{ key: 'mA', label: 'Merchant A', spend: 1500, txCount: 15 }];
  return {
    name: 'volume-only',
    description: 'Same merchant, same ticket, +50% transaction count.',
    aggA,
    aggB,
    expected: {
      priceEffect: 0,
      volumeEffect: (15 - 10) * 100,
      crossEffect: 0,
      mixInEffect: 0,
      mixOutEffect: 0,
      delta: 500,
    },
  };
}

function mixInPure(): Scenario {
  const aggA: RawAggregation[] = [];
  const aggB: RawAggregation[] = [
    { key: 'mNew', label: 'New Merchant', spend: 800, txCount: 4 },
  ];
  return {
    name: 'mix-in-only',
    description: 'New merchant appears in period B.',
    aggA,
    aggB,
    expected: {
      priceEffect: 0,
      volumeEffect: 0,
      crossEffect: 0,
      mixInEffect: 800,
      mixOutEffect: 0,
      delta: 800,
    },
  };
}

function mixOutPure(): Scenario {
  const aggA: RawAggregation[] = [
    { key: 'mDrop', label: 'Dropped Merchant', spend: 600, txCount: 6 },
  ];
  const aggB: RawAggregation[] = [];
  return {
    name: 'mix-out-only',
    description: 'Merchant from period A is gone in period B.',
    aggA,
    aggB,
    expected: {
      priceEffect: 0,
      volumeEffect: 0,
      crossEffect: 0,
      mixInEffect: 0,
      mixOutEffect: -600,
      delta: -600,
    },
  };
}

function crossTerm(): Scenario {
  // Both price AND volume change → cross term should be non-zero.
  // A: 10 tx × 100 = 1000.  B: 15 tx × 150 = 2250.
  // priceEffect  = (150-100) * 10  = 500
  // volumeEffect = (15-10) * 100   = 500
  // crossEffect  = (150-100) * (15-10) = 250
  // delta = priceEffect + volumeEffect + crossEffect = 1250.
  const aggA: RawAggregation[] = [{ key: 'mA', label: 'Merchant A', spend: 1000, txCount: 10 }];
  const aggB: RawAggregation[] = [{ key: 'mA', label: 'Merchant A', spend: 2250, txCount: 15 }];
  return {
    name: 'cross-term',
    description: 'Both price and volume up — checks the cross interaction term.',
    aggA,
    aggB,
    expected: {
      priceEffect: 500,
      volumeEffect: 500,
      crossEffect: 250,
      mixInEffect: 0,
      mixOutEffect: 0,
      delta: 1250,
    },
  };
}

function mixed(): Scenario {
  // Realistic mix:
  // - mKeep: 5 tx × 200 = 1000  →  6 tx × 220 = 1320  (price + volume)
  //     priceEffect  = (220-200)*5 = 100
  //     volumeEffect = (6-5)*200   = 200
  //     crossEffect  = (220-200)*(6-5) = 20
  // - mPriceDown: 4 tx × 300 = 1200 → 4 tx × 250 = 1000 (price drop only)
  //     priceEffect  = (250-300)*4 = -200
  // - mGone: 3 tx × 100 = 300 in A only → mixOut = -300
  // - mNew: 2 tx × 400 = 800 in B only → mixIn = +800
  // Sum check:
  //   spendA = 1000 + 1200 + 300 = 2500
  //   spendB = 1320 + 1000 + 800 = 3120
  //   delta  = 620
  //   priceEffect = 100 + (-200) = -100
  //   volumeEffect = 200
  //   crossEffect = 20
  //   mixIn  = +800
  //   mixOut = -300
  //   sum    = -100 + 200 + 20 + 800 - 300 = 620 ✓
  const aggA: RawAggregation[] = [
    { key: 'mKeep', label: 'Keep', spend: 1000, txCount: 5 },
    { key: 'mPriceDown', label: 'PriceDown', spend: 1200, txCount: 4 },
    { key: 'mGone', label: 'Gone', spend: 300, txCount: 3 },
  ];
  const aggB: RawAggregation[] = [
    { key: 'mKeep', label: 'Keep', spend: 1320, txCount: 6 },
    { key: 'mPriceDown', label: 'PriceDown', spend: 1000, txCount: 4 },
    { key: 'mNew', label: 'New', spend: 800, txCount: 2 },
  ];
  return {
    name: 'realistic-mix',
    description: 'One merchant grows, one drops in price, one appears, one disappears.',
    aggA,
    aggB,
    expected: {
      priceEffect: -100,
      volumeEffect: 200,
      crossEffect: 20,
      mixInEffect: 800,
      mixOutEffect: -300,
      delta: 620,
    },
  };
}

interface ResultRow {
  scenario: string;
  description: string;
  expectedDelta: number;
  actualDelta: number;
  identityHolds: boolean;
  err: {
    price: number;
    volume: number;
    cross: number;
    mixIn: number;
    mixOut: number;
  };
}

function diff(expected: Expected, actualTotals: ReturnType<typeof decomposeAggregations>['totals']): ResultRow['err'] {
  return {
    price: r(actualTotals.priceEffect - expected.priceEffect),
    volume: r(actualTotals.volumeEffect - expected.volumeEffect),
    cross: r(actualTotals.crossEffect - expected.crossEffect),
    mixIn: r(actualTotals.mixInEffect - expected.mixInEffect),
    mixOut: r(actualTotals.mixOutEffect - expected.mixOutEffect),
  };
}

const TOLERANCE = 0.01;

function main() {
  const scenarios: Scenario[] = [
    pricePure(),
    volumePure(),
    mixInPure(),
    mixOutPure(),
    crossTerm(),
    mixed(),
  ];
  const results: ResultRow[] = [];

  for (const s of scenarios) {
    const report = decomposeAggregations({ aggA: s.aggA, aggB: s.aggB });
    const t = report.totals;
    const errs = diff(s.expected, t);
    const recovered =
      Math.abs(errs.price) <= TOLERANCE &&
      Math.abs(errs.volume) <= TOLERANCE &&
      Math.abs(errs.cross) <= TOLERANCE &&
      Math.abs(errs.mixIn) <= TOLERANCE &&
      Math.abs(errs.mixOut) <= TOLERANCE;
    // Identity: delta == priceEffect + volumeEffect + crossEffect + mixIn + mixOut
    const sumOfEffects =
      t.priceEffect + t.volumeEffect + t.crossEffect + t.mixInEffect + t.mixOutEffect;
    const identityHolds = Math.abs(sumOfEffects - t.delta) <= TOLERANCE;
    results.push({
      scenario: s.name,
      description: s.description,
      expectedDelta: s.expected.delta,
      actualDelta: t.delta,
      identityHolds,
      err: errs,
    });
    const flag = recovered && identityHolds ? '✓' : '✗';
    console.log(
      `${flag} ${s.name.padEnd(18)} | Δ ${t.delta} (expected ${s.expected.delta}) ` +
        `| err P:${errs.price} V:${errs.volume} X:${errs.cross} ` +
        `I:${errs.mixIn} O:${errs.mixOut}`,
    );
  }

  const outDir = resolve(__dirname, '..', '..', 'eval');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const csvPath = resolve(outDir, 'v3-validation.csv');
  const headers = [
    'scenario',
    'description',
    'expectedDelta',
    'actualDelta',
    'identityHolds',
    'errPrice',
    'errVolume',
    'errCross',
    'errMixIn',
    'errMixOut',
  ];
  const rows = results.map((r) => [
    r.scenario,
    `"${r.description.replace(/"/g, '""')}"`,
    r.expectedDelta,
    r.actualDelta,
    r.identityHolds,
    r.err.price,
    r.err.volume,
    r.err.cross,
    r.err.mixIn,
    r.err.mixOut,
  ]);
  writeFileSync(
    csvPath,
    [headers, ...rows].map((r) => r.join(',')).join('\n'),
    'utf8',
  );
  const failures = results.filter(
    (x) =>
      !x.identityHolds ||
      Math.abs(x.err.price) > TOLERANCE ||
      Math.abs(x.err.volume) > TOLERANCE ||
      Math.abs(x.err.cross) > TOLERANCE ||
      Math.abs(x.err.mixIn) > TOLERANCE ||
      Math.abs(x.err.mixOut) > TOLERANCE,
  );
  console.log(
    `\n${results.length - failures.length}/${results.length} scenarios recovered ground truth (tolerance ${TOLERANCE}).`,
  );
  console.log(`Wrote ${csvPath}`);
  if (failures.length > 0) {
    console.error('✗ Some scenarios failed:');
    for (const f of failures) console.error('  -', f.scenario);
    process.exit(1);
  }
}

main();
