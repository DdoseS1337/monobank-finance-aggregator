'use client';

import { useTransition } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  deleteScenarioAction,
  resimulateScenarioAction,
} from './actions';
import type { ScenarioDto, ScenarioOutcomeDto } from '@/lib/api';

interface Props {
  scenarios: ScenarioDto[];
}

const METRIC_LABELS: Record<string, string> = {
  end_balance_p50: 'Кінцевий баланс P50',
  first_deficit_day: 'Перший дефіцит (день #)',
  mean_daily_outflow: 'Сер. витрата / день',
};

const METRIC_FORMAT: Record<string, (v: number) => string> = {
  end_balance_p50: (v) =>
    new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(v),
  first_deficit_day: (v) => (v < 0 ? 'немає' : String(Math.round(v))),
  mean_daily_outflow: (v) =>
    new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(v),
};

function formatMetric(key: string, value: number): string {
  const fn = METRIC_FORMAT[key];
  return fn ? fn(value) : value.toFixed(2);
}

function deltaBadgeColor(o: ScenarioOutcomeDto, key: string): string {
  // for "first_deficit_day" — bigger is better; otherwise depends on metric.
  const positiveBetter = key === 'end_balance_p50' || key === 'first_deficit_day';
  if (o.delta === 0) return 'text-muted-foreground bg-muted';
  const isImproving = positiveBetter ? o.delta > 0 : o.delta < 0;
  return isImproving
    ? 'text-emerald-600 bg-emerald-500/10'
    : 'text-red-600 bg-red-500/10';
}

export function ScenarioList({ scenarios }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <ul className="space-y-3">
      {scenarios.map((s) => (
        <li
          key={s.id}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{s.name}</h3>
              <p className="text-xs text-muted-foreground">
                {s.computedAt
                  ? `Симульовано ${new Date(s.computedAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}`
                  : 'Очікує симуляції'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => startTransition(() => resimulateScenarioAction(s.id))}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Перезапустити
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  if (!confirm('Видалити сценарій?')) return;
                  startTransition(() => deleteScenarioAction(s.id));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {s.outcomes && s.outcomes.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {s.outcomes.map((o) => (
                <div key={o.metricKey} className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    {METRIC_LABELS[o.metricKey] ?? o.metricKey}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {formatMetric(o.metricKey, o.modified)}
                  </p>
                  <p className="text-xs">
                    <span
                      className={cn(
                        'inline-flex rounded-md px-1.5 py-0.5 font-medium',
                        deltaBadgeColor(o, o.metricKey),
                      )}
                    >
                      Δ {o.delta > 0 ? '+' : ''}
                      {formatMetric(o.metricKey, o.delta)}{' '}
                      ({o.deltaPct >= 0 ? '+' : ''}{o.deltaPct.toFixed(1)}%)
                    </span>
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Змінні
            </p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {s.variables.map((v, i) => (
                <li key={i}>· {variableSummary(v)}</li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}

function variableSummary(v: ScenarioDto['variables'][number]): string {
  switch (v.kind) {
    case 'INCOME_DELTA':
      return `Δ дохід ${v.deltaMonthly >= 0 ? '+' : ''}${v.deltaMonthly} / міс. ${v.reason ? `(${v.reason})` : ''}`;
    case 'CATEGORY_DELTA':
      return `Категорія "${v.categorySlug}" ${v.deltaPct >= 0 ? '+' : ''}${v.deltaPct}%`;
    case 'NEW_GOAL':
      return `Нова ціль "${v.name}" ${v.targetAmount} до ${v.deadline}`;
    case 'NEW_RECURRING':
      return `Нова ${v.sign === 'INFLOW' ? 'дохідна' : 'витратна'} рекурентна "${v.description}" ${v.amountMonthly} / міс.`;
  }
}
