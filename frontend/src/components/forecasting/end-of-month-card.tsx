'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import type { EndOfMonthProjection } from '@/lib/types';

const PACE_STYLES: Record<EndOfMonthProjection['paceStatus'], {
  label: string;
  color: string;
  badge: string;
}> = {
  under: {
    label: 'Економно',
    color: 'text-green-400',
    badge: 'text-green-400 border-green-400/30',
  },
  on_track: {
    label: 'В нормі',
    color: 'text-blue-400',
    badge: 'text-blue-400 border-blue-400/30',
  },
  over: {
    label: 'Перевитрата',
    color: 'text-red-400',
    badge: 'text-red-400 border-red-400/30',
  },
};

interface Props {
  data: EndOfMonthProjection;
}

export function EndOfMonthCard({ data }: Props) {
  const paceStyle = PACE_STYLES[data.paceStatus];
  const actual = parseFloat(data.actualToDate);
  const projected = parseFloat(data.projectedTotal);
  const progressPct = projected > 0 ? (actual / projected) * 100 : 0;
  const timePct = (data.daysElapsed / (data.daysElapsed + data.daysRemaining)) * 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Прогноз до кінця місяця</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Пройшло {data.daysElapsed} днів · залишилось {data.daysRemaining}
            </p>
          </div>
          <Badge variant="outline" className={paceStyle.badge}>
            {paceStyle.label} (темп × {data.spendingPace})
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main projection */}
        <div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-xs text-muted-foreground">Прогноз на кінець місяця</p>
              <p className={`text-3xl font-bold tabular-nums ${paceStyle.color}`}>
                {formatCurrency(data.projectedTotal)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">
              зараз: {formatCurrency(data.actualToDate)}
            </p>
          </div>

          {/* Progress bar: money spent vs time elapsed */}
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(100, progressPct)}%` }}
            />
            <div
              className="absolute inset-y-0 w-0.5 bg-foreground/50"
              style={{ left: `${timePct}%` }}
              title={`${timePct.toFixed(0)}% часу минуло`}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
            <span>витрачено {progressPct.toFixed(0)}%</span>
            <span>часу минуло {timePct.toFixed(0)}%</span>
          </div>
        </div>

        {/* 3-scenario bars */}
        <div className="grid grid-cols-3 gap-3">
          <ScenarioBox
            label="Оптимістичний"
            value={data.optimistic}
            color="text-green-400"
          />
          <ScenarioBox
            label="Реалістичний"
            value={data.realistic}
            color="text-blue-400"
            highlighted
          />
          <ScenarioBox
            label="Песимістичний"
            value={data.pessimistic}
            color="text-red-400"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Залишилось витратити ~{formatCurrency(data.projectedRemaining)} за{' '}
          {data.daysRemaining} днів
        </p>
      </CardContent>
    </Card>
  );
}

function ScenarioBox({
  label, value, color, highlighted = false,
}: {
  label: string;
  value: string;
  color: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlighted ? 'border-primary/30 bg-primary/5' : 'border-border'
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-bold tabular-nums mt-1 ${color}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
