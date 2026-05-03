'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { getCategoryLabel } from '@/lib/constants';
import type { CategoryForecast } from '@/lib/types';

interface Props {
  forecasts: CategoryForecast[];
}

export function CategoryForecastsTable({ forecasts }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Прогноз по категоріях</CardTitle>
        <p className="text-sm text-muted-foreground">
          Проєкція на поточний місяць з урахуванням тренду
        </p>
      </CardHeader>
      <CardContent>
        {forecasts.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            Недостатньо історичних даних.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left font-normal py-2">Категорія</th>
                  <th className="text-right font-normal py-2">Прогноз</th>
                  <th className="text-right font-normal py-2 hidden sm:table-cell">
                    Серед./міс
                  </th>
                  <th className="text-right font-normal py-2 hidden md:table-cell">
                    Мин. міс
                  </th>
                  <th className="text-right font-normal py-2">Тренд</th>
                  <th className="text-right font-normal py-2">Точність</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.slice(0, 20).map((f) => {
                  const trendNum = parseFloat(f.trendPct);
                  const trendColor =
                    Math.abs(trendNum) < 5
                      ? 'text-muted-foreground'
                      : trendNum > 0
                      ? 'text-red-400'
                      : 'text-green-400';
                  return (
                    <tr
                      key={f.category}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-2.5">{getCategoryLabel(f.category)}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium">
                        {formatCurrency(f.projectedThisMonth)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                        {formatCurrency(f.avgMonthlySpend)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                        {formatCurrency(f.lastMonthSpend)}
                      </td>
                      <td
                        className={`py-2.5 text-right tabular-nums ${trendColor}`}
                      >
                        {trendNum > 0 ? '+' : ''}
                        {f.trendPct}%
                      </td>
                      <td className="py-2.5 text-right">
                        <ConfidenceBar value={f.confidence} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.7 ? 'bg-green-500' : value >= 0.4 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8">{pct}%</span>
    </div>
  );
}
