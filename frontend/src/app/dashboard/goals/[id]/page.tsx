import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { ApiError, getServerToken, goalsApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { MoneyDisplay } from '@/components/shared/money-display';
import { FeasibilityRing } from '@/components/shared/feasibility-ring';
import { ContributeForm } from './contribute-form';
import { LifecycleButtons } from './lifecycle-buttons';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function GoalDetailPage({ params }: PageProps) {
  const { id } = await params;
  const token = await getServerToken();
  if (!token) redirect('/login');

  let goal;
  try {
    goal = await goalsApi.get(token, id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/goals"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Усі цілі
      </Link>

      <PageHeader
        title={goal.name}
        description={`Тип: ${TYPE_LABEL[goal.type]} · пріоритет ${goal.priority}`}
        actions={<LifecycleButtons goalId={goal.id} status={goal.status} />}
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm text-muted-foreground">Прогрес</p>
            <p className="text-sm tabular-nums">
              <MoneyDisplay amount={goal.currentAmount} currency={goal.baseCurrency} /> /{' '}
              <MoneyDisplay amount={goal.targetAmount} currency={goal.baseCurrency} />
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.min(100, goal.pct)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {goal.pct}% досягнуто · залишилось{' '}
            <MoneyDisplay amount={goal.remaining} currency={goal.baseCurrency} />
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-muted/30 p-3">
              <dt className="text-xs text-muted-foreground">Дедлайн</dt>
              <dd className="mt-0.5 font-medium">
                {goal.deadline
                  ? new Date(goal.deadline).toLocaleDateString('uk-UA', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'без дедлайну'}
              </dd>
            </div>
            <div className="rounded-md bg-muted/30 p-3">
              <dt className="text-xs text-muted-foreground">Місяців у запасі</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {goal.feasibility.monthsAvailable !== null
                  ? goal.feasibility.monthsAvailable.toFixed(1)
                  : '—'}
              </dd>
            </div>
            <div className="rounded-md bg-muted/30 p-3">
              <dt className="text-xs text-muted-foreground">
                Потрібно щомісячно
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {goal.feasibility.requiredMonthlyContribution ? (
                  <MoneyDisplay
                    amount={goal.feasibility.requiredMonthlyContribution}
                    currency={goal.baseCurrency}
                  />
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="rounded-md bg-muted/30 p-3">
              <dt className="text-xs text-muted-foreground">
                Середній фактичний внесок
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {goal.feasibility.averageMonthlyContribution > 0 ? (
                  <MoneyDisplay
                    amount={goal.feasibility.averageMonthlyContribution.toFixed(2)}
                    currency={goal.baseCurrency}
                  />
                ) : (
                  'ще не контрибутили'
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-medium text-muted-foreground">Feasibility</p>
          <div className="mt-3">
            <FeasibilityRing
              score={goal.feasibility.score}
              category={goal.feasibility.category}
              size="lg"
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Оцінка ймовірності досягти цілі вчасно — на основі поточного темпу контрибуцій і дедлайну.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Внести у ціль</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ручний внесок підтягне фактичний прогрес і feasibility-бал.
        </p>
        <div className="mt-4">
          <ContributeForm
            goalId={goal.id}
            currency={goal.baseCurrency}
            disabled={goal.status !== 'ACTIVE'}
          />
        </div>
      </section>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  SAVING: 'Накопичення',
  DEBT_PAYOFF: 'Погашення боргу',
  INVESTMENT: 'Інвестиція',
  PURCHASE: 'Велика покупка',
};
