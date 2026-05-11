import { redirect } from 'next/navigation';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { cashflowApi, getServerToken } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { MoneyDisplay } from '@/components/shared/money-display';
import { EmptyState } from '@/components/shared/empty-state';
import { LazyTrajectoryChart } from '@/components/cashflow/trajectory-chart-lazy';
import { RefreshButton } from './refresh-button';

export const dynamic = 'force-dynamic';

export default async function CashflowPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');

  const projection = await cashflowApi.latest(token).catch(() => null);

  if (!projection) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Cashflow прогноз"
          description="P10/P50/P90 траєкторія балансу + виявлення вікон дефіциту."
          actions={<RefreshButton hasProjection={false} />}
        />
        <EmptyState
          icon={Sparkles}
          title="Прогнозу ще немає"
          description="Запустіть Monte Carlo симуляцію, щоб побачити трирівневу траєкторію (P10/P50/P90) і потенційні дефіцити."
        />
      </div>
    );
  }

  const generatedAt = new Date(projection.generatedAt);
  const confidence = projection.confidenceScore ?? 0;
  const horizon = projection.horizonDays;
  const deficits = projection.deficitWindows;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cashflow прогноз"
        description={`Модель ${projection.modelVersion} · оновлено ${generatedAt.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}`}
        actions={<RefreshButton hasProjection={true} />}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricBox label="Горизонт" value={`${horizon} дн.`} hint="P10 / P50 / P90" />
        <MetricBox
          label="Довіра моделі"
          value={`${Math.round(confidence * 100)}%`}
          hint="Heuristic confidence proxy"
        />
        <MetricBox
          label="Деdефіцит-вікна"
          value={String(deficits.length)}
          hint={
            deficits.length === 0
              ? 'Поки що чисто'
              : `Найгірший: ${formatDay(deficits[0]!.worstDay)}`
          }
        />
      </section>

      {deficits.length > 0 && (
        <section className="space-y-3">
          {deficits.map((d) => (
            <div
              key={d.worstDay}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div className="flex-1">
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Дефіцит до{' '}
                  <MoneyDisplay amount={Math.abs(d.worstAmount)} currency="UAH" />{' '}
                  на {formatDay(d.worstDay)}
                </p>
                <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/80">
                  Вікно: {formatDay(d.start)} — {formatDay(d.end)} · ймовірність ~
                  {Math.round(d.confidence * 100)}%
                </p>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Траєкторія балансу</h2>
          <p className="text-xs text-muted-foreground">
            Зона: P10 → P90 · лінія: P50 (медіана)
          </p>
        </div>
        <LazyTrajectoryChart points={projection.points} />
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Прийняті припущення</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          {projection.assumptions.map((a) => (
            <li key={a.key} className="rounded-md bg-muted/30 p-3">
              <p className="text-muted-foreground">{ASSUMPTION_LABEL[a.key] ?? a.key}</p>
              <p className="mt-0.5 font-medium tabular-nums">{String(a.value)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MetricBox({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
  });
}

const ASSUMPTION_LABEL: Record<string, string> = {
  starting_balance: 'Старт. баланс',
  recurring_count: 'К-сть рекурентних',
  baseline_observations: 'Спостережень',
  mean_inflow_daily: 'Сер. дохід / день',
  std_outflow_daily: 'Std витрат / день',
};
