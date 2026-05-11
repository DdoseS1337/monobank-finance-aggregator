import type { FxRateDto } from '@/lib/api';

/**
 * Sums a list of monetary positions converting each to `target` using the
 * Monobank rates already loaded by the page. Falls back to the source
 * amount (skipping conversion) if no rate is available — better than
 * silently dropping the position.
 */
export interface FxAmount {
  amount: number | string;
  currency: string;
}

export function sumInCurrency(
  positions: FxAmount[],
  target: string,
  rates: FxRateDto[],
): number {
  let total = 0;
  for (const p of positions) {
    const value = typeof p.amount === 'string' ? Number(p.amount) : p.amount;
    if (!Number.isFinite(value)) continue;
    if (p.currency === target) {
      total += value;
      continue;
    }
    const rate = findRate(p.currency, target, rates);
    if (rate === null) {
      // Drop unknown-pair positions silently rather than skewing the total
      // by mixing currencies. Surface a warning if you need full strictness.
      continue;
    }
    total += value * rate;
  }
  return total;
}

function findRate(from: string, to: string, rates: FxRateDto[]): number | null {
  const direct = rates.find((r) => r.base === from && r.quote === to);
  if (direct) return direct.rate;
  const inverse = rates.find((r) => r.base === to && r.quote === from);
  if (inverse && inverse.rate > 0) return 1 / inverse.rate;
  // Triangulate via UAH (Monobank publishes most pairs against UAH).
  if (from !== 'UAH' && to !== 'UAH') {
    const left = findRate(from, 'UAH', rates);
    const right = findRate('UAH', to, rates);
    if (left !== null && right !== null) return left * right;
  }
  return null;
}
