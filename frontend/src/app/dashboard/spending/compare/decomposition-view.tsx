'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { MoneyDisplay } from '@/components/shared/money-display';
import { cn } from '@/lib/utils';
import type { SpendingDecompositionDto } from '@/lib/api';

export function DecompositionView({
  report,
}: {
  report: SpendingDecompositionDto;
}) {
  const { totals, currency, periodA, periodB, items, groupBy } = report;
  const explained =
    totals.priceEffect +
    totals.volumeEffect +
    totals.crossEffect +
    totals.mixInEffect +
    totals.mixOutEffect;
  const direction = totals.delta > 0 ? 'up' : totals.delta < 0 ? 'down' : 'flat';

  const components = [
    {
      label: 'PRICE',
      hint: 'Той самий мерчант, інший середній чек',
      value: totals.priceEffect,
      color: 'bg-amber-500',
    },
    {
      label: 'VOLUME',
      hint: 'Той самий мерчант, інша кількість покупок',
      value: totals.volumeEffect,
      color: 'bg-blue-500',
    },
    {
      label: 'MIX +',
      hint: 'Нові мерчанти, яких не було у базовому періоді',
      value: totals.mixInEffect,
      color: 'bg-emerald-500',
    },
    {
      label: 'MIX −',
      hint: 'Мерчанти, які зникли у періоді порівняння',
      value: totals.mixOutEffect,
      color: 'bg-violet-500',
    },
    {
      label: 'CROSS',
      hint: 'Спільний ефект ціни і кількості (часто малий)',
      value: totals.crossEffect,
      color: 'bg-slate-500',
    },
  ];

  const maxAbs = Math.max(
    1,
    ...components.map((c) => Math.abs(c.value)),
    Math.abs(totals.delta),
  );

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PeriodCard
          label={`Період A · ${periodA.txCount} тр.`}
          spend={periodA.spend}
          currency={currency}
          range={`${formatDate(periodA.from)} – ${formatDate(periodA.to)}`}
        />
        <PeriodCard
          label={`Період B · ${periodB.txCount} тр.`}
          spend={periodB.spend}
          currency={currency}
          range={`${formatDate(periodB.from)} – ${formatDate(periodB.to)}`}
        />
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Зміна B − A
          </p>
          <p
            className={cn(
              'mt-2 text-3xl font-semibold tabular-nums',
              direction === 'up' && 'text-red-600',
              direction === 'down' && 'text-emerald-600',
            )}
          >
            <MoneyDisplay amount={totals.delta} currency={currency} signed />
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {direction === 'up' && <ArrowUpRight className="h-3 w-3" />}
            {direction === 'down' && <ArrowDownRight className="h-3 w-3" />}
            {direction === 'flat' && <Minus className="h-3 w-3" />}
            {totals.deltaPct > 0 ? '+' : ''}
            {totals.deltaPct}% від базового
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Декомпозиція зміни</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Тотожність:{' '}
          <span className="font-mono">
            Δ = price + volume + cross + mix⁺ + mix⁻
          </span>{' '}
          ={' '}
          <MoneyDisplay
            amount={explained}
            currency={currency}
            signed
            className="font-mono"
          />
        </p>
        <div className="space-y-2">
          {components.map((c) => (
            <ComponentBar
              key={c.label}
              label={c.label}
              hint={c.hint}
              value={c.value}
              currency={currency}
              maxAbs={maxAbs}
              color={c.color}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">
            Топ {Math.min(items.length, 20)} {groupBy === 'merchant' ? 'мерчантів' : 'категорій'}
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">
                  {groupBy === 'merchant' ? 'Мерчант' : 'Категорія'}
                </th>
                <th className="px-3 py-2 text-right">A</th>
                <th className="px-3 py-2 text-right">B</th>
                <th className="px-3 py-2 text-right">Δ</th>
                <th className="px-3 py-2 text-right">PRICE</th>
                <th className="px-3 py-2 text-right">VOLUME</th>
                <th className="px-3 py-2 text-right">статус</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">
                    <div className="truncate">{item.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {item.countA} → {item.countB} тр.
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <MoneyDisplay amount={item.spendA} currency={currency} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <MoneyDisplay amount={item.spendB} currency={currency} />
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right font-medium tabular-nums',
                      item.delta > 0 && 'text-red-600',
                      item.delta < 0 && 'text-emerald-600',
                    )}
                  >
                    <MoneyDisplay
                      amount={item.delta}
                      currency={currency}
                      signed
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.status === 'BOTH' ? (
                      <MoneyDisplay
                        amount={item.priceEffect}
                        currency={currency}
                        signed
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.status === 'BOTH' ? (
                      <MoneyDisplay
                        amount={item.volumeEffect}
                        currency={currency}
                        signed
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PeriodCard({
  label,
  spend,
  currency,
  range,
}: {
  label: string;
  spend: number;
  currency: string;
  range: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">
        <MoneyDisplay amount={spend} currency={currency} />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{range}</p>
    </div>
  );
}

function ComponentBar({
  label,
  hint,
  value,
  currency,
  maxAbs,
  color,
}: {
  label: string;
  hint: string;
  value: number;
  currency: string;
  maxAbs: number;
  color: string;
}) {
  const widthPct = (Math.abs(value) / maxAbs) * 100;
  const positive = value > 0;
  return (
    <div className="grid grid-cols-[110px_1fr_120px] items-center gap-3 text-xs">
      <div>
        <div className="font-mono font-semibold">{label}</div>
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      </div>
      <div className="relative h-5 rounded bg-muted/30">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <div
          className={cn(
            'absolute inset-y-0 rounded',
            color,
            positive ? 'left-1/2' : 'right-1/2',
          )}
          style={{ width: `${widthPct / 2}%` }}
        />
      </div>
      <div
        className={cn(
          'text-right font-mono tabular-nums',
          positive && 'text-red-600',
          !positive && value < 0 && 'text-emerald-600',
        )}
      >
        <MoneyDisplay amount={value} currency={currency} signed />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'BOTH' | 'NEW' | 'DROPPED' }) {
  const styles: Record<typeof status, string> = {
    BOTH: 'bg-muted/40 text-muted-foreground',
    NEW: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    DROPPED: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  };
  const labels: Record<typeof status, string> = {
    BOTH: 'обидва',
    NEW: 'новий',
    DROPPED: 'зник',
  };
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] uppercase', styles[status])}>
      {labels[status]}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
