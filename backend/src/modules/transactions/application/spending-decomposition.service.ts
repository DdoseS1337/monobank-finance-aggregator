import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';

export interface PeriodInput {
  from: Date;
  to: Date;
}

export interface DecompositionInput {
  userId: string;
  periodA: PeriodInput;
  periodB: PeriodInput;
  groupBy?: 'merchant' | 'category';
}

export interface MerchantDelta {
  key: string;
  label: string;
  spendA: number;
  spendB: number;
  countA: number;
  countB: number;
  avgTicketA: number;
  avgTicketB: number;
  /** Absolute change B − A. */
  delta: number;
  /** How much of the delta is explained by avg-ticket (price) difference. */
  priceEffect: number;
  /** How much by transaction-count difference. */
  volumeEffect: number;
  /** Cross term (price change × volume change), small but kept explicit. */
  crossEffect: number;
  /** Status: BOTH = present in both, NEW = only in B, DROPPED = only in A. */
  status: 'BOTH' | 'NEW' | 'DROPPED';
}

export interface ContributorEntry {
  label: string;
  delta: number;
  reason: 'PRICE' | 'VOLUME' | 'NEW' | 'DROPPED' | 'MIXED';
}

export interface DecompositionReport {
  currency: string;
  periodA: { from: string; to: string; spend: number; txCount: number };
  periodB: { from: string; to: string; spend: number; txCount: number };
  totals: {
    delta: number;
    deltaPct: number;
    priceEffect: number;
    volumeEffect: number;
    mixInEffect: number; // spend from new merchants/categories
    mixOutEffect: number; // negative spend from dropped merchants/categories
    crossEffect: number;
  };
  /** Pre-rendered Ukrainian narrative — the agent should quote this verbatim. */
  narrative: string;
  /** Top drivers of the change, by absolute size. */
  topIncreases: ContributorEntry[];
  topDecreases: ContributorEntry[];
  groupBy: 'merchant' | 'category';
  items: MerchantDelta[];
}

export interface RawAggregation {
  key: string;
  label: string;
  spend: number;
  txCount: number;
}

export interface PureDecompositionInput {
  aggA: RawAggregation[];
  aggB: RawAggregation[];
  currency?: string;
  periodA?: { from: string; to: string };
  periodB?: { from: string; to: string };
  groupBy?: 'merchant' | 'category';
}

/**
 * Pure-function form of the decomposition (no DB access). Exposed so the
 * eval harness can validate the algorithm against synthetic ground truth.
 * The instance method `decompose()` is a thin wrapper that aggregates first
 * and then calls this.
 */
export function decomposeAggregations(
  input: PureDecompositionInput,
): DecompositionReport {
  const { aggA, aggB } = input;
  const groupBy = input.groupBy ?? 'merchant';
  const currency = input.currency ?? 'UAH';
  const aById = new Map(aggA.map((r) => [r.key, r]));
  const bById = new Map(aggB.map((r) => [r.key, r]));
  const allKeys = new Set<string>([...aById.keys(), ...bById.keys()]);

  const items: MerchantDelta[] = [];
  let totalPrice = 0;
  let totalVolume = 0;
  let totalCross = 0;
  let mixIn = 0;
  let mixOut = 0;

  for (const key of allKeys) {
    const a = aById.get(key);
    const b = bById.get(key);
    const label = (a ?? b)!.label;

    if (a && b) {
      const avgA = a.txCount > 0 ? a.spend / a.txCount : 0;
      const avgB = b.txCount > 0 ? b.spend / b.txCount : 0;
      const priceEffect = (avgB - avgA) * a.txCount;
      const volumeEffect = (b.txCount - a.txCount) * avgA;
      const crossEffect = (avgB - avgA) * (b.txCount - a.txCount);
      totalPrice += priceEffect;
      totalVolume += volumeEffect;
      totalCross += crossEffect;
      items.push({
        key,
        label,
        spendA: round(a.spend),
        spendB: round(b.spend),
        countA: a.txCount,
        countB: b.txCount,
        avgTicketA: round(avgA),
        avgTicketB: round(avgB),
        delta: round(b.spend - a.spend),
        priceEffect: round(priceEffect),
        volumeEffect: round(volumeEffect),
        crossEffect: round(crossEffect),
        status: 'BOTH',
      });
    } else if (b) {
      mixIn += b.spend;
      items.push({
        key,
        label,
        spendA: 0,
        spendB: round(b.spend),
        countA: 0,
        countB: b.txCount,
        avgTicketA: 0,
        avgTicketB: round(b.txCount > 0 ? b.spend / b.txCount : 0),
        delta: round(b.spend),
        priceEffect: 0,
        volumeEffect: 0,
        crossEffect: 0,
        status: 'NEW',
      });
    } else if (a) {
      mixOut -= a.spend;
      items.push({
        key,
        label,
        spendA: round(a.spend),
        spendB: 0,
        countA: a.txCount,
        countB: 0,
        avgTicketA: round(a.txCount > 0 ? a.spend / a.txCount : 0),
        avgTicketB: 0,
        delta: round(-a.spend),
        priceEffect: 0,
        volumeEffect: 0,
        crossEffect: 0,
        status: 'DROPPED',
      });
    }
  }

  items.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const spendA = aggA.reduce((s, r) => s + r.spend, 0);
  const spendB = aggB.reduce((s, r) => s + r.spend, 0);
  const txCountA = aggA.reduce((s, r) => s + r.txCount, 0);
  const txCountB = aggB.reduce((s, r) => s + r.txCount, 0);
  const delta = spendB - spendA;
  const deltaPct = spendA === 0 ? 0 : (delta / spendA) * 100;

  const topIncreases: ContributorEntry[] = items
    .filter((i) => i.delta > 0)
    .slice(0, 5)
    .map((i) => ({ label: i.label, delta: i.delta, reason: classifyReason(i) }));
  const topDecreases: ContributorEntry[] = items
    .filter((i) => i.delta < 0)
    .slice(0, 5)
    .map((i) => ({ label: i.label, delta: i.delta, reason: classifyReason(i) }));

  const narrative = buildNarrative({
    currency,
    delta: round(delta),
    deltaPct: round(deltaPct),
    priceEffect: round(totalPrice),
    volumeEffect: round(totalVolume),
    crossEffect: round(totalCross),
    mixInEffect: round(mixIn),
    mixOutEffect: round(mixOut),
    groupBy,
    topIncreases,
    topDecreases,
    periodA: input.periodA,
    periodB: input.periodB,
  });

  return {
    currency,
    periodA: {
      from: input.periodA?.from ?? new Date(0).toISOString(),
      to: input.periodA?.to ?? new Date(0).toISOString(),
      spend: round(spendA),
      txCount: txCountA,
    },
    periodB: {
      from: input.periodB?.from ?? new Date(0).toISOString(),
      to: input.periodB?.to ?? new Date(0).toISOString(),
      spend: round(spendB),
      txCount: txCountB,
    },
    totals: {
      delta: round(delta),
      deltaPct: round(deltaPct),
      priceEffect: round(totalPrice),
      volumeEffect: round(totalVolume),
      crossEffect: round(totalCross),
      mixInEffect: round(mixIn),
      mixOutEffect: round(mixOut),
    },
    narrative,
    topIncreases,
    topDecreases,
    groupBy,
    items,
  };
}

function classifyReason(item: MerchantDelta): ContributorEntry['reason'] {
  if (item.status === 'NEW') return 'NEW';
  if (item.status === 'DROPPED') return 'DROPPED';
  const absPrice = Math.abs(item.priceEffect);
  const absVolume = Math.abs(item.volumeEffect);
  if (absPrice > absVolume * 1.5) return 'PRICE';
  if (absVolume > absPrice * 1.5) return 'VOLUME';
  return 'MIXED';
}

interface NarrativeInput {
  currency: string;
  delta: number;
  deltaPct: number;
  priceEffect: number;
  volumeEffect: number;
  crossEffect: number;
  mixInEffect: number;
  mixOutEffect: number;
  groupBy: 'merchant' | 'category';
  topIncreases: ContributorEntry[];
  topDecreases: ContributorEntry[];
  periodA?: { from: string; to: string };
  periodB?: { from: string; to: string };
}

function buildNarrative(n: NarrativeInput): string {
  const dim = n.groupBy === 'merchant' ? 'мерчантів' : 'категорій';
  const dimSingle = n.groupBy === 'merchant' ? 'мерчанта' : 'категорії';
  const direction =
    n.delta > 0 ? 'зросли' : n.delta < 0 ? 'зменшились' : 'не змінились';
  const fmt = (v: number): string => {
    const abs = Math.abs(v).toLocaleString('uk-UA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    return `${sign}${abs} ${n.currency}`;
  };
  const periodLabel = (p?: { from: string; to: string }): string => {
    if (!p) return '';
    return `${p.from.slice(0, 10)} … ${p.to.slice(0, 10)}`;
  };
  const reasonLabel: Record<ContributorEntry['reason'], string> = {
    PRICE: 'середній чек зріс/впав',
    VOLUME: 'більше/менше походів',
    NEW: `новий ${dimSingle}`,
    DROPPED: `відсутній цього періоду ${dimSingle}`,
    MIXED: 'і ціна, і обсяг змінились',
  };

  const lines: string[] = [];
  if (n.periodA && n.periodB) {
    lines.push(
      `Порівняння періодів: A = ${periodLabel(n.periodA)} → B = ${periodLabel(n.periodB)}.`,
    );
  }
  lines.push(
    `Витрати ${direction} на ${fmt(n.delta)} (${n.deltaPct > 0 ? '+' : ''}${n.deltaPct.toFixed(1)}%).`,
  );
  lines.push('Розклад дельти (сума з 5 складових точно дорівнює загальній зміні):');
  lines.push(
    `  • Ціновий ефект: ${fmt(n.priceEffect)} — той самий ${dimSingle}, інший середній чек.`,
  );
  lines.push(
    `  • Об'ємний ефект: ${fmt(n.volumeEffect)} — той самий ${dimSingle}, інша кількість транзакцій.`,
  );
  lines.push(
    `  • Перехресний ефект: ${fmt(n.crossEffect)} — спільна зміна ціни × обсягу.`,
  );
  lines.push(
    `  • Нові ${dim} у періоді B (mixIn): ${fmt(n.mixInEffect)}.`,
  );
  lines.push(
    `  • Відсутні у періоді B (mixOut): ${fmt(n.mixOutEffect)}.`,
  );

  if (n.topIncreases.length > 0) {
    lines.push(`Топ зростання серед ${dim}:`);
    for (const e of n.topIncreases) {
      lines.push(`  • ${e.label}: ${fmt(e.delta)} (${reasonLabel[e.reason]}).`);
    }
  }
  if (n.topDecreases.length > 0) {
    lines.push(`Топ зменшення серед ${dim}:`);
    for (const e of n.topDecreases) {
      lines.push(`  • ${e.label}: ${fmt(e.delta)} (${reasonLabel[e.reason]}).`);
    }
  }

  return lines.join('\n');
}

/**
 * Decomposes the change in spending between two periods into:
 *
 *   - PRICE  effect — same merchant/category, different average ticket
 *   - VOLUME effect — same merchant/category, different transaction count
 *   - MIX    effect — merchants/categories present only in one period
 *   - CROSS  term   — joint price×volume residual (Laspeyres-style)
 *
 * Identity:
 *   delta = priceEffect + volumeEffect + crossEffect + mixIn + mixOut
 *
 * For each merchant present in BOTH periods we use the additive form:
 *   priceEffect  = (avgB - avgA) * countA
 *   volumeEffect = (countB - countA) * avgA
 *   crossEffect  = (avgB - avgA) * (countB - countA)
 *
 * For new merchants (only in B):     mixIn  +=  spendB
 * For dropped merchants (only in A): mixOut += -spendA
 *
 * The decomposition is *exact* by construction. Use it to give the user a
 * causal explanation of "why did spending go up" rather than a single number.
 */
@Injectable()
export class SpendingDecompositionService {
  constructor(private readonly prisma: PrismaService) {}

  async decompose(input: DecompositionInput): Promise<DecompositionReport> {
    const groupBy = input.groupBy ?? 'merchant';
    const aggA = await this.aggregate(input.userId, input.periodA, groupBy);
    const aggB = await this.aggregate(input.userId, input.periodB, groupBy);
    const currency = this.dominantCurrency([aggA, aggB]);
    return decomposeAggregations({
      aggA,
      aggB,
      currency,
      groupBy,
      periodA: {
        from: input.periodA.from.toISOString(),
        to: input.periodA.to.toISOString(),
      },
      periodB: {
        from: input.periodB.from.toISOString(),
        to: input.periodB.to.toISOString(),
      },
    });
  }

  private async aggregate(
    userId: string,
    period: PeriodInput,
    groupBy: 'merchant' | 'category',
  ): Promise<RawAggregation[]> {
    const txs = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: 'DEBIT',
        status: { in: ['POSTED', 'PENDING'] },
        transactionDate: { gte: period.from, lte: period.to },
      },
      select: {
        amount: true,
        currency: true,
        merchantName: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    });

    // Filter to dominant currency to keep math sound (we don't FX-convert here;
    // dominant currency wins, others dropped from the decomposition).
    const dominant = this.dominantCurrencyFromTxs(txs);
    const filtered = txs.filter((t) => t.currency === dominant);

    const map = new Map<string, RawAggregation>();
    for (const t of filtered) {
      let key: string;
      let label: string;
      if (groupBy === 'merchant') {
        key = (t.merchantName ?? 'unknown').toLowerCase();
        label = t.merchantName ?? 'Без мерчанта';
      } else {
        key = t.categoryId ?? '__none';
        label = t.category?.name ?? 'Без категорії';
      }
      const existing = map.get(key);
      const amount = Number(t.amount);
      if (existing) {
        existing.spend += amount;
        existing.txCount += 1;
      } else {
        map.set(key, { key, label, spend: amount, txCount: 1 });
      }
    }
    return Array.from(map.values());
  }

  private dominantCurrencyFromTxs(
    txs: Array<{ currency: string; amount: unknown }>,
  ): string {
    const totals = new Map<string, number>();
    for (const t of txs) {
      totals.set(
        t.currency,
        (totals.get(t.currency) ?? 0) + Number(t.amount),
      );
    }
    let best = 'UAH';
    let max = -1;
    for (const [c, v] of totals) {
      if (v > max) {
        best = c;
        max = v;
      }
    }
    return best;
  }

  private dominantCurrency(aggregations: RawAggregation[][]): string {
    const totals = new Map<string, number>();
    for (const list of aggregations) {
      for (const r of list) {
        // currency was already filtered to dominant inside aggregate(),
        // but if both periods are empty we fall back to UAH.
        totals.set('UAH', (totals.get('UAH') ?? 0) + r.spend);
      }
    }
    return totals.size === 0 ? 'UAH' : 'UAH';
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
