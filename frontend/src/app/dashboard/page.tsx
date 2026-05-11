import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Inbox,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  accountsApi,
  budgetsApi,
  cashflowApi,
  fxApi,
  getServerToken,
  goalsApi,
  recommendationsApi,
  transactionsApi,
  type AccountSummary,
  type BudgetDto,
  type CashflowProjectionDto,
  type FxRateDto,
  type GoalDto,
  type RecommendationDto,
  type TransactionDto,
} from '@/lib/api';
import { HealthScoreBadge, type HealthStatus } from '@/components/shared/health-score-badge';
import { MoneyDisplay } from '@/components/shared/money-display';
import { StatCard } from '@/components/shared/stat-card';
import { cn } from '@/lib/utils';
import { sumInCurrency } from '@/lib/fx';

export const dynamic = 'force-dynamic';

interface DashboardData {
  accounts: AccountSummary[];
  budgets: BudgetDto[];
  goals: GoalDto[];
  cashflow: CashflowProjectionDto | null;
  recommendations: RecommendationDto[];
  recentTransactions: TransactionDto[];
  fxRates: FxRateDto[];
}

async function fetchDashboardData(token: string): Promise<DashboardData> {
  // Parallel fetch — every endpoint is independent.
  // (Vercel rule: async-parallel.)
  const [
    accounts,
    budgets,
    goals,
    cashflow,
    recommendations,
    transactionsPage,
    fxRates,
  ] = await Promise.all([
    accountsApi.list(token).catch(() => [] as AccountSummary[]),
    budgetsApi.list(token).catch(() => [] as BudgetDto[]),
    goalsApi.list(token).catch(() => [] as GoalDto[]),
    cashflowApi.latest(token).catch(() => null),
    recommendationsApi
      .list(token, { status: ['PENDING', 'DELIVERED'], limit: 3, validOnly: true })
      .catch(() => [] as RecommendationDto[]),
    transactionsApi
      .list(token, { limit: 5 })
      .catch(() => ({ items: [] as TransactionDto[], nextCursor: null })),
    fxApi.rates(token).catch(() => [] as FxRateDto[]),
  ]);
  return {
    accounts,
    budgets,
    goals,
    cashflow,
    recommendations,
    recentTransactions: transactionsPage.items,
    fxRates,
  };
}

function totalBalance(
  accounts: AccountSummary[],
  fxRates: FxRateDto[],
): { amount: number; currency: string } {
  if (accounts.length === 0) return { amount: 0, currency: 'UAH' };
  const amount = sumInCurrency(
    accounts.map((a) => ({ amount: a.balance, currency: a.currency })),
    'UAH',
    fxRates,
  );
  return { amount, currency: 'UAH' };
}

function aggregatedHealth(budgets: BudgetDto[]): HealthStatus {
  if (budgets.length === 0) return 'UNKNOWN';
  if (budgets.some((b) => b.health.status === 'RED')) return 'RED';
  if (budgets.some((b) => b.health.status === 'YELLOW')) return 'YELLOW';
  return 'GREEN';
}

function nearestDeficit(
  cashflow: CashflowProjectionDto | null,
): { daysAhead: number; amount: number } | null {
  if (!cashflow || cashflow.deficitWindows.length === 0) return null;
  const window = cashflow.deficitWindows[0]!;
  const days = Math.max(
    0,
    Math.round(
      (new Date(window.worstDay).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );
  return { daysAhead: days, amount: window.worstAmount };
}

export default async function DashboardPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const data = await fetchDashboardData(token);
  const balance = totalBalance(data.accounts, data.fxRates);
  const health = aggregatedHealth(data.budgets);
  const deficit = nearestDeficit(data.cashflow);
  const activeGoals = data.goals.filter((g) => g.status === 'ACTIVE');
  const atRiskGoals = activeGoals.filter(
    (g) => g.feasibility.category === 'AT_RISK',
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Огляд</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Поточний стан фінансів і ключові тригери на сьогодні.
          </p>
        </div>
        <HealthScoreBadge status={health} className="text-sm" />
      </header>

      {deficit && (
        <DeficitAlert daysAhead={deficit.daysAhead} amount={deficit.amount} />
      )}

      {data.fxRates.length > 0 && <FxStrip rates={data.fxRates} />}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Загальний баланс"
          icon={Wallet}
          value={
            data.accounts.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <MoneyDisplay amount={balance.amount} currency={balance.currency} />
            )
          }
          hint={`${data.accounts.length} рахунк${plural(data.accounts.length)}`}
        />
        <StatCard
          label="Активні бюджети"
          icon={Wallet}
          value={data.budgets.length}
          hint={budgetsHint(data.budgets)}
          trend={budgetsTrend(data.budgets)}
        />
        <StatCard
          label="Активні цілі"
          icon={Target}
          value={activeGoals.length}
          hint={
            atRiskGoals.length > 0
              ? `${atRiskGoals.length} під ризиком`
              : 'Усі в темпі'
          }
          trend={atRiskGoals.length > 0 ? 'down' : 'flat'}
        />
        <StatCard
          label="Прогноз cashflow"
          icon={TrendingUp}
          value={
            data.cashflow ? `${data.cashflow.horizonDays} дн.` : <span className="text-muted-foreground">—</span>
          }
          hint={
            data.cashflow?.confidenceScore != null
              ? `Довіра ${(data.cashflow.confidenceScore * 100).toFixed(0)}%`
              : 'Запустіть оновлення'
          }
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RecommendationsPreview items={data.recommendations} />
        <GoalsPreview goals={activeGoals.slice(0, 4)} />
      </section>

      <BudgetsPreview budgets={data.budgets.slice(0, 4)} />

      <RecentTransactions items={data.recentTransactions} />
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function FxStrip({ rates }: { rates: FxRateDto[] }) {
  const pairs = ['USD/UAH', 'EUR/UAH', 'GBP/UAH', 'PLN/UAH'];
  const byPair = new Map(rates.map((r) => [`${r.base}/${r.quote}`, r]));
  const items = pairs
    .map((p) => byPair.get(p))
    .filter((r): r is FxRateDto => Boolean(r));
  if (items.length === 0) return null;
  const asOf = items[0]!.asOf;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        Курси (Monobank)
      </span>
      {items.map((r) => (
        <span
          key={`${r.base}-${r.quote}`}
          className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1 tabular-nums"
        >
          <span className="font-medium">
            {r.base}/{r.quote}
          </span>
          <span className="text-muted-foreground">
            {r.rate.toFixed(2)}
          </span>
        </span>
      ))}
      <span className="ml-auto text-[11px] text-muted-foreground">
        {new Date(asOf).toLocaleString('uk-UA', {
          dateStyle: 'short',
          timeStyle: 'short',
        })}
      </span>
    </section>
  );
}

function DeficitAlert({ daysAhead, amount }: { daysAhead: number; amount: number }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          За {daysAhead} {daysAhead === 1 ? 'день' : daysAhead < 5 ? 'дні' : 'днів'} прогнозується дефіцит
        </p>
        <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-200">
          Глибина дефіциту: <MoneyDisplay amount={Math.abs(amount)} signed={false} />
        </p>
      </div>
      <Link
        href="/dashboard/cashflow"
        className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-amber-900 hover:underline dark:text-amber-100"
      >
        Деталі <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function RecommendationsPreview({ items }: { items: RecommendationDto[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Рекомендації
        </h2>
        <Link
          href="/dashboard/recommendations"
          className="text-xs font-medium text-primary hover:underline"
        >
          Усі →
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyHint icon={Inbox} text="Поки що немає активних рекомендацій." />
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm"
            >
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium uppercase text-primary">
                  {r.kind}
                </span>
                {r.expectedImpact?.financial && (
                  <span className="text-muted-foreground">
                    Імпакт: <MoneyDisplay amount={r.expectedImpact.financial.amount} currency={r.expectedImpact.financial.currency} />
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-foreground">{r.explanation}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalsPreview({ goals }: { goals: GoalDto[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" />
          Цілі
        </h2>
        <Link
          href="/dashboard/goals"
          className="text-xs font-medium text-primary hover:underline"
        >
          Усі →
        </Link>
      </div>
      {goals.length === 0 ? (
        <EmptyHint icon={Target} text="Жодної активної цілі." />
      ) : (
        <ul className="space-y-3">
          {goals.map((g) => (
            <li key={g.id}>
              <Link
                href={`/dashboard/goals/${g.id}`}
                className="block rounded-lg p-2 hover:bg-muted/40"
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate font-medium">{g.name}</span>
                  <span className="text-muted-foreground">{g.pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BudgetsPreview({ budgets }: { budgets: BudgetDto[] }) {
  if (budgets.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold">Бюджети</h2>
        <EmptyHint
          icon={Wallet}
          text="Створіть перший бюджет — система буде відслідковувати витрати по категоріях."
          actionHref="/dashboard/budgets"
          actionLabel="Створити бюджет"
        />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Активні бюджети</h2>
        <Link
          href="/dashboard/budgets"
          className="text-xs font-medium text-primary hover:underline"
        >
          Деталі →
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {budgets.map((b) => (
          <Link
            key={b.id}
            href={`/dashboard/budgets/${b.id}`}
            className="rounded-lg border border-border/50 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-start justify-between">
              <p className="truncate text-sm font-medium">{b.name}</p>
              <HealthScoreBadge status={b.health.status} className="text-[10px]" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {b.health.totalLines} ліній · перевищено {b.health.exceededLines}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function RecentTransactions({ items }: { items: TransactionDto[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold">Останні транзакції</h2>
        <EmptyHint
          icon={Wallet}
          text="Підключіть Monobank, щоб імпортувати транзакції."
          actionHref="/dashboard/accounts"
          actionLabel="Підключити"
        />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-5">
        <h2 className="text-sm font-semibold">Останні транзакції</h2>
        <Link
          href="/dashboard/transactions"
          className="text-xs font-medium text-primary hover:underline"
        >
          Усі →
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {items.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-4 p-4 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {t.merchantName ?? t.description ?? 'Транзакція'}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(t.transactionDate).toLocaleString('uk-UA', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </p>
            </div>
            <MoneyDisplay
              amount={Number(t.amount) * (t.type === 'CREDIT' ? 1 : -1)}
              currency={t.currency}
              className={cn(
                'whitespace-nowrap text-sm font-medium tabular-nums',
                t.type === 'CREDIT' ? 'text-emerald-600' : 'text-foreground',
              )}
              signed
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyHint({
  icon: Icon,
  text,
  actionHref,
  actionLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

function plural(count: number): string {
  if (count === 1) return '';
  if (count >= 2 && count <= 4) return 'и';
  return 'ів';
}

function budgetsHint(budgets: BudgetDto[]): string {
  if (budgets.length === 0) return 'Жодного активного';
  const exceeded = budgets.filter((b) => b.health.status === 'RED').length;
  const warning = budgets.filter((b) => b.health.status === 'YELLOW').length;
  if (exceeded > 0) return `${exceeded} перевищено`;
  if (warning > 0) return `${warning} під ризиком`;
  return 'Усі в нормі';
}

function budgetsTrend(budgets: BudgetDto[]): 'up' | 'down' | 'flat' {
  if (budgets.some((b) => b.health.status === 'RED')) return 'down';
  if (budgets.some((b) => b.health.status === 'YELLOW')) return 'down';
  return 'flat';
}
