const CURRENCY_MAP: Record<number, string> = {
  980: 'UAH',
  840: 'USD',
  978: 'EUR',
  826: 'GBP',
  985: 'PLN',
  203: 'CZK',
  756: 'CHF',
  392: 'JPY',
  156: 'CNY',
  949: 'TRY',
};

export function currencyCodeToString(numericCode: number): string {
  return CURRENCY_MAP[numericCode] ?? String(numericCode).slice(0, 3);
}
