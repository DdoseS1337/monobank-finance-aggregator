interface MoneyDisplayProps {
  amount: string | number;
  currency?: string;
  className?: string;
  signed?: boolean;
}

const FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = FORMATTERS.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    });
    FORMATTERS.set(currency, f);
  }
  return f;
}

export function MoneyDisplay({
  amount,
  currency = 'UAH',
  className,
  signed = false,
}: MoneyDisplayProps) {
  const numeric = typeof amount === 'string' ? Number(amount) : amount;
  const display = formatter(currency).format(Math.abs(numeric));
  // Always show "−" for negative balances. `signed` only controls whether
  // positives get an explicit "+" (used for transaction deltas).
  let prefix = '';
  if (numeric < 0) prefix = '−';
  else if (signed && numeric > 0) prefix = '+';
  return (
    <span className={className} suppressHydrationWarning>
      {prefix}
      {display}
    </span>
  );
}
