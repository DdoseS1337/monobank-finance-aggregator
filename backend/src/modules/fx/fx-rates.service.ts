import { Injectable, Logger } from '@nestjs/common';
import {
  MonobankClient,
  MonobankCurrencyRate,
} from '../transactions/infrastructure/monobank.client';

/**
 * ISO 4217 numeric → alpha-3 for the currencies Monobank actually quotes.
 * Sourced from https://api.monobank.ua/bank/currency response inventory.
 * Add codes here as needed — the service auto-resolves anything in this map.
 */
const NUMERIC_TO_ISO: Record<number, string> = {
  // Reference & western majors
  980: 'UAH',
  840: 'USD',
  978: 'EUR',
  826: 'GBP',
  756: 'CHF',
  392: 'JPY',
  // Nordics
  752: 'SEK',
  578: 'NOK',
  208: 'DKK',
  352: 'ISK',
  // Central / Eastern Europe
  985: 'PLN',
  203: 'CZK',
  348: 'HUF',
  946: 'RON',
  975: 'BGN',
  941: 'RSD',
  // Asia-Pacific
  156: 'CNY',
  344: 'HKD',
  702: 'SGD',
  410: 'KRW',
  376: 'ILS',
  784: 'AED',
  949: 'TRY',
  356: 'INR',
  764: 'THB',
  704: 'VND',
  // Americas / Oceania
  124: 'CAD',
  36: 'AUD',
  554: 'NZD',
  484: 'MXN',
  // Africa
  710: 'ZAR',
  818: 'EGP',
  // Other commonly-listed
  933: 'BYN',
  398: 'KZT',
  860: 'UZS',
  981: 'GEL',
  51: 'AMD',
  944: 'AZN',
  417: 'KGS',
  496: 'MNT',
  969: 'MDL',
};

const ISO_TO_NUMERIC: Record<string, number> = Object.fromEntries(
  Object.entries(NUMERIC_TO_ISO).map(([num, iso]) => [iso, Number(num)]),
);

const TTL_MS = 5 * 60 * 1000; // Monobank caps `/bank/currency` at 1 req / 5 min.

export interface FxRate {
  base: string;
  quote: string;
  rate: number;
  asOf: string;
}

@Injectable()
export class FxRatesService {
  private readonly logger = new Logger(FxRatesService.name);
  private cache: { fetchedAt: number; raw: MonobankCurrencyRate[] } | null = null;
  private inflight: Promise<MonobankCurrencyRate[]> | null = null;

  constructor(private readonly monobank: MonobankClient) {}

  async listSupported(): Promise<FxRate[]> {
    const raw = await this.load();
    const out: FxRate[] = [];
    for (const row of raw) {
      const base = NUMERIC_TO_ISO[row.currencyCodeA];
      const quote = NUMERIC_TO_ISO[row.currencyCodeB];
      if (!base || !quote) continue;
      const rate = this.pickRate(row);
      if (rate === null) continue;
      out.push({
        base,
        quote,
        rate,
        asOf: new Date(row.date * 1000).toISOString(),
      });
    }
    return out;
  }

  async convert(
    amount: number,
    from: string,
    to: string,
  ): Promise<{ amount: number; rate: number; asOf: string }> {
    if (from === to) {
      return { amount, rate: 1, asOf: new Date().toISOString() };
    }
    const direct = await this.findRate(from, to);
    if (direct) {
      return {
        amount: round(amount * direct.rate),
        rate: direct.rate,
        asOf: direct.asOf,
      };
    }
    // Triangulate via UAH: from→UAH→to.
    if (from !== 'UAH' && to !== 'UAH') {
      const fromToUah = await this.findRate(from, 'UAH');
      const uahToQuote = await this.findRate('UAH', to);
      if (fromToUah && uahToQuote) {
        const rate = fromToUah.rate * uahToQuote.rate;
        return {
          amount: round(amount * rate),
          rate,
          asOf:
            fromToUah.asOf < uahToQuote.asOf ? fromToUah.asOf : uahToQuote.asOf,
        };
      }
    }
    throw new Error(`No rate available for ${from}→${to}`);
  }

  private async findRate(from: string, to: string): Promise<FxRate | null> {
    const fromCode = ISO_TO_NUMERIC[from];
    const toCode = ISO_TO_NUMERIC[to];
    if (!fromCode || !toCode) return null;
    const raw = await this.load();
    const direct = raw.find(
      (r) => r.currencyCodeA === fromCode && r.currencyCodeB === toCode,
    );
    if (direct) {
      const rate = this.pickRate(direct);
      if (rate !== null) {
        return {
          base: from,
          quote: to,
          rate,
          asOf: new Date(direct.date * 1000).toISOString(),
        };
      }
    }
    const inverse = raw.find(
      (r) => r.currencyCodeA === toCode && r.currencyCodeB === fromCode,
    );
    if (inverse) {
      const rate = this.pickRate(inverse);
      if (rate !== null && rate > 0) {
        return {
          base: from,
          quote: to,
          rate: 1 / rate,
          asOf: new Date(inverse.date * 1000).toISOString(),
        };
      }
    }
    return null;
  }

  private pickRate(row: MonobankCurrencyRate): number | null {
    if (typeof row.rateCross === 'number') return row.rateCross;
    if (typeof row.rateBuy === 'number' && typeof row.rateSell === 'number') {
      return (row.rateBuy + row.rateSell) / 2;
    }
    if (typeof row.rateBuy === 'number') return row.rateBuy;
    if (typeof row.rateSell === 'number') return row.rateSell;
    return null;
  }

  private async load(): Promise<MonobankCurrencyRate[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < TTL_MS) {
      return this.cache.raw;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.monobank
      .getCurrencyRates()
      .then((raw) => {
        this.cache = { fetchedAt: Date.now(), raw };
        return raw;
      })
      .catch((err) => {
        this.logger.warn(`FX fetch failed: ${(err as Error).message}`);
        if (this.cache) return this.cache.raw; // serve stale on failure
        throw err;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
