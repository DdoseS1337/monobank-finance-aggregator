import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApiError, budgetsApi, categoriesApi, getServerToken } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { HealthScoreBadge } from '@/components/shared/health-score-badge';
import { MoneyDisplay } from '@/components/shared/money-display';
import { ArchiveButton } from './archive-button';
import { LineRow } from './line-row';
import { AddLineForm } from './add-line-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BudgetDetailPage({ params }: PageProps) {
  const { id } = await params;
  const token = await getServerToken();
  if (!token) redirect('/login');

  let budget;
  try {
    budget = await budgetsApi.get(token, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const categories = await categoriesApi.list(token).catch(() => []);

  const period = budget.currentPeriod;
  const lines = period?.lines ?? [];
  const usedCategoryIds = lines
    .map((l) => l.categoryId)
    .filter((id): id is string => Boolean(id));

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/budgets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Усі бюджети
      </Link>

      <PageHeader
        title={budget.name}
        description={
          period
            ? `Поточний період: ${formatDate(period.start)} → ${formatDate(period.end)}`
            : 'Період ще не відкрито'
        }
        actions={
          <>
            <HealthScoreBadge status={budget.health.status} />
            <ArchiveButton budgetId={budget.id} />
          </>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">План</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {period?.totalPlanned ? (
              <MoneyDisplay amount={period.totalPlanned} currency={budget.baseCurrency} />
            ) : (
              '—'
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Витрачено</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {period?.totalSpent ? (
              <MoneyDisplay amount={period.totalSpent} currency={budget.baseCurrency} />
            ) : (
              '—'
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Здоров'я</p>
          <p className="mt-2 flex items-baseline gap-2 text-2xl font-semibold">
            {budget.health.totalLines}{' '}
            <span className="text-base font-normal text-muted-foreground">ліній</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {budget.health.exceededLines} перевищено · {budget.health.atRiskLines} під ризиком
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <h2 className="text-sm font-semibold">Лінії бюджету</h2>
          <AddLineForm
            budgetId={budget.id}
            categories={categories}
            usedCategoryIds={usedCategoryIds}
          />
        </header>
        {lines.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Жодної лінії в поточному періоді.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((line) => (
              <LineRow
                key={line.id}
                budgetId={budget.id}
                line={line}
                currency={budget.baseCurrency}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
