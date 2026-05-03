import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { CURRENCY_MAP } from "./constants"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const NUMERIC_TO_CURRENCY: Record<string, string> = {
  '980': 'UAH', '840': 'USD', '978': 'EUR', '826': 'GBP', '985': 'PLN',
  '203': 'CZK', '756': 'CHF', '392': 'JPY', '156': 'CNY', '949': 'TRY',
  '752': 'SEK', '208': 'DKK', '946': 'RON', '348': 'HUF', '975': 'BGN',
  '036': 'AUD', '124': 'CAD', '578': 'NOK', '702': 'SGD', '344': 'HKD',
  '554': 'NZD', '410': 'KRW', '764': 'THB', '376': 'ILS', '986': 'BRL',
};

export function formatCurrency(
  amount: string | number,
  currency: string = 'UAH',
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const resolved = NUMERIC_TO_CURRENCY[currency] ?? currency;
  try {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: resolved,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${num.toFixed(2)} ${resolved}`;
  }
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function getCurrencySymbol(currencyCode: number): string {
  return CURRENCY_MAP[currencyCode]?.symbol ?? '?';
}

export function getCurrencyName(currencyCode: number): string {
  return CURRENCY_MAP[currencyCode]?.code ?? `${currencyCode}`;
}
