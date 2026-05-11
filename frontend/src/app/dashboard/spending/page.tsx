import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GitCompare, PieChart } from 'lucide-react';
import { getServerToken, transactionsApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { MoneyDisplay } from '@/components/shared/money-display';
import { DEFAULT_CATEGORY_COLOR } from '@/lib/constants';
import { PeriodPicker } from './period-picker';
import { SpendingChart } from './spending-chart';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

type Period =
  | 'month'
  | 'prev_month'
  | '7'
  | '30'
  | '90'
  | '180'
  | '365';

const VALID_PERIODS: Period[] = [
  'month',
  'prev_month',
  '7',
  '30',
  '90',
  '180',
  '365',
];

function resolveRange(period: Period): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: now, label: 'Цей місяць' };
  }
  if (period === 'prev_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from, to, label: 'Минулий місяць' };
  }
  const days = Number(period);
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const labels: Record<string, string> = {
    '7': 'Останні 7 днів',
    '30': 'Останні 30 днів',
    '90': 'Останні 90 днів',
    '180': 'Останні 6 місяців',
    '365': 'Останній рік',
  };
  return { from, to: now, label: labels[period] ?? `Останні ${days} днів` };
}

export default async function SpendingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = await getServerToken();
  if (!token) redirect('/login');

  const period: Period = VALID_PERIODS.includes(params.period as Period)
    ? (params.period as Period)
    : 'month';
  const range = resolveRange(period);

  const summary = await transactionsApi
    .spendingSummary(token, {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    })
    .catch(() => null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Витрати"
        description={`${range.label} · ${range.from.toLocaleDateString('uk-UA')} – ${range.to.toLocaleDateString('uk-UA')}`}
        actions={
          <>
            <PeriodPicker initial={period} />
            <Link
              href="/dashboard/spending/compare"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:bg-muted/50"
            >
              <GitCompare className="h-3.5 w-3.5" />
              Порівняти періоди
            </Link>
          </>
        }
      />

      {!summary || Number(summary.total) === 0 ? (
        <EmptyState
          icon={PieChart}
          title="Витрат за цей період немає"
          description="Спробуйте інший діапазон або імпортуйте транзакції з Monobank."
          actionHref="/dashboard/accounts"
          actionLabel="До рахунків"
        />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Всього витрачено
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                <MoneyDisplay amount={summary.total} currency={summary.currency} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.txCount} транзакцій
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Середній чек
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                <MoneyDisplay
                  amount={
                    summary.txCount > 0 ? Number(summary.total) / summary.txCount : 0
                  }
                  currency={summary.currency}
                />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                За {summary.txCount || 0} операцій
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Середньо на день
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                <MoneyDisplay
                  amount={dailyAverage(summary.total, range.from, range.to)}
                  currency={summary.currency}
                />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {daysInRange(range.from, range.to)} дн. у періоді
              </p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold">Розподіл по категоріях</h2>
              <SpendingChart slices={summary.byCategory} currency={summary.currency} />
            </div>

            <div className="rounded-xl border border-border bg-card lg:col-span-3">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold">Категорії</h2>
              </div>
              <ul className="divide-y divide-border">
                {summary.byCategory.map((slice, idx) => (
                  <li key={slice.categoryId ?? `none-${idx}`} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{
                            backgroundColor: slice.color ?? DEFAULT_CATEGORY_COLOR,
                          }}
                        />
                        <span className="truncate font-medium">{slice.name}</span>
                        <span className="text-xs text-muted-foreground">
                          · {slice.txCount}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {slice.pct.toFixed(1)}%
                        </span>
                        <span className="font-medium tabular-nums">
                          <MoneyDisplay
                            amount={slice.amount}
                            currency={summary.currency}
                          />
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, slice.pct)}%`,
                          backgroundColor: slice.color ?? DEFAULT_CATEGORY_COLOR,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function daysInRange(from: Date, to: Date): number {
  return Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

function dailyAverage(total: string, from: Date, to: Date): number {
  return Number(total) / daysInRange(from, to);
}
