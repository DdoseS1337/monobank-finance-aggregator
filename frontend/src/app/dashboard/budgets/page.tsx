import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Wallet } from 'lucide-react';
import { budgetsApi, getServerToken } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { HealthScoreBadge } from '@/components/shared/health-score-badge';
import { MoneyDisplay } from '@/components/shared/money-display';
import { EmptyState } from '@/components/shared/empty-state';

export const dynamic = 'force-dynamic';

export default async function BudgetsPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const budgets = await budgetsApi.list(token).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Бюджети"
        description="Контроль витрат по категоріях та envelope методу."
        actions={
          <Link
            href="/dashboard/budgets/new"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            <Plus className="h-4 w-4" /> Створити
          </Link>
        }
      />

      {budgets.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Жодного активного бюджету"
          description="Бюджет дозволяє планувати витрати по категоріях. Система автоматично відстежуватиме фактичні суми."
          actionHref="/dashboard/budgets/new"
          actionLabel="Створити перший бюджет"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {budgets.map((b) => {
            const lines = b.currentPeriod?.lines ?? [];
            const totalPlanned = b.currentPeriod?.totalPlanned;
            const totalSpent = b.currentPeriod?.totalSpent;
            return (
              <Link
                key={b.id}
                href={`/dashboard/budgets/${b.id}`}
                className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{b.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {METHOD_LABEL[b.method]} · {CADENCE_LABEL[b.cadence]}
                    </p>
                  </div>
                  <HealthScoreBadge status={b.health.status} className="text-[10px]" />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-muted/30 p-2">
                    <dt className="text-muted-foreground">План</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      {totalPlanned ? (
                        <MoneyDisplay amount={totalPlanned} currency={b.baseCurrency} />
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted/30 p-2">
                    <dt className="text-muted-foreground">Витрачено</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      {totalSpent ? (
                        <MoneyDisplay amount={totalSpent} currency={b.baseCurrency} />
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs text-muted-foreground">
                  {lines.length} ліні{lines.length === 1 ? 'я' : 'й'} ·{' '}
                  {b.health.atRiskLines > 0 && `${b.health.atRiskLines} під ризиком · `}
                  {b.health.exceededLines > 0
                    ? `${b.health.exceededLines} перевищено`
                    : 'жодного перевищення'}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const METHOD_LABEL: Record<string, string> = {
  CATEGORY: 'Категорійний',
  ENVELOPE: 'Envelope',
  ZERO_BASED: 'Zero-based',
  PAY_YOURSELF_FIRST: 'Pay-yourself-first',
};

const CADENCE_LABEL: Record<string, string> = {
  WEEKLY: 'Тижневий',
  MONTHLY: 'Місячний',
  CUSTOM: 'Власний',
};
