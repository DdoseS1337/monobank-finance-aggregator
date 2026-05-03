'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { getCategoryLabel } from '@/lib/constants';
import type { MonthPeriodBehavior } from '@/lib/types';

interface Props {
  data: MonthPeriodBehavior[];
}

export function MonthPeriodCard({ data }: Props) {
  const maxTotal = Math.max(...data.map((d) => parseFloat(d.totalSpending)), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Поведінка в різні періоди місяця</CardTitle>
        <p className="text-sm text-muted-foreground">
          Коли ви витрачаєте найбільше — на початку, в середині чи в кінці місяця
        </p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            Недостатньо даних.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.map((p) => {
              const pct = (parseFloat(p.totalSpending) / maxTotal) * 100;
              return (
                <div key={p.period} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{p.periodLabel}</p>
                      <p className="text-xs text-muted-foreground">День {p.dayRange}</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold tabular-nums mt-3">
                    {formatCurrency(p.avgSpending)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    в середньому · {p.transactionCount} транзакцій
                  </p>
                  <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {p.topCategories.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Топ категорії:</p>
                      {p.topCategories.map((c) => (
                        <div
                          key={c.category}
                          className="flex justify-between text-xs tabular-nums"
                        >
                          <span className="text-muted-foreground truncate">
                            {getCategoryLabel(c.category)}
                          </span>
                          <span>{formatCurrency(c.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
