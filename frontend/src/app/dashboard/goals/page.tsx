import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Target } from 'lucide-react';
import { getServerToken, goalsApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { MoneyDisplay } from '@/components/shared/money-display';
import { FeasibilityRing } from '@/components/shared/feasibility-ring';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function GoalsPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const goals = await goalsApi.list(token).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Цілі"
        description="Накопичення, погашення боргів, інвестиції — кожна з прогнозом досяжності."
        actions={
          <Link
            href="/dashboard/goals/new"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            <Plus className="h-4 w-4" /> Нова ціль
          </Link>
        }
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Жодної цілі"
          description="Створіть першу ціль — система розрахує feasibility і нагадає, коли ви відстаєте."
          actionHref="/dashboard/goals/new"
          actionLabel="Створити ціль"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {goals.map((g) => (
            <Link
              key={g.id}
              href={`/dashboard/goals/${g.id}`}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {GOAL_TYPE_LABEL[g.type]}
                  </p>
                  <h2 className="truncate text-lg font-semibold">{g.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    <MoneyDisplay amount={g.currentAmount} currency={g.baseCurrency} /> /{' '}
                    <MoneyDisplay amount={g.targetAmount} currency={g.baseCurrency} />
                    {g.deadline && (
                      <>
                        {' · до '}
                        {new Date(g.deadline).toLocaleDateString('uk-UA', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </>
                    )}
                  </p>
                </div>
                <FeasibilityRing
                  score={g.feasibility.score}
                  category={g.feasibility.category}
                  size="sm"
                />
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    g.feasibility.category === 'AT_RISK'
                      ? 'bg-red-500'
                      : g.feasibility.category === 'TIGHT'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500',
                  )}
                  style={{ width: `${Math.min(100, g.pct)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {g.pct}% досягнуто
                {g.feasibility.requiredMonthlyContribution &&
                  ` · потрібно ~${formatMoney(g.feasibility.requiredMonthlyContribution, g.baseCurrency)} / міс.`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const GOAL_TYPE_LABEL: Record<string, string> = {
  SAVING: 'Накопичення',
  DEBT_PAYOFF: 'Погашення боргу',
  INVESTMENT: 'Інвестиція',
  PURCHASE: 'Велика покупка',
};

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}
