'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, getCategoryLabel } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { SpendingByCategoryItem } from '@/lib/types';

interface Props {
  data: SpendingByCategoryItem[];
}

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: SpendingByCategoryItem }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="font-medium text-sm">{getCategoryLabel(item.category)}</p>
      <p className="text-sm text-muted-foreground">
        {formatCurrency(item.total)} ({parseFloat(item.percent).toFixed(1)}%)
      </p>
      <p className="text-xs text-muted-foreground">{item.count} транзакцій</p>
    </div>
  );
}

export function CategoryChart({ data }: Props) {
  const reducedMotion = useReducedMotion();

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Витрати за категоріями</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">Немає даних</CardContent>
      </Card>
    );
  }

  const totalExpense = data.reduce((s, d) => s + parseFloat(d.total), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Витрати за категоріями</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row items-center gap-6">
          <div className="relative w-56 h-56 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={96}
                  dataKey="total"
                  nameKey="category"
                  strokeWidth={3}
                  stroke="hsl(var(--background))"
                  animationBegin={0}
                  animationDuration={700}
                  isAnimationActive={!reducedMotion}
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.category}
                      fill={CATEGORY_COLORS[entry.category] ?? DEFAULT_CATEGORY_COLOR}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-xs text-muted-foreground">Всього</p>
              <p className="text-base font-bold tabular-nums">{formatCurrency(totalExpense)}</p>
            </div>
          </div>

          <div className="flex-1 space-y-2 w-full">
            {data.slice(0, 9).map((item) => {
              const color = CATEGORY_COLORS[item.category] ?? DEFAULT_CATEGORY_COLOR;
              const pct = parseFloat(item.percent);
              return (
                <div key={item.category} className="flex items-center gap-2 text-sm">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="truncate flex-1 text-xs">{getCategoryLabel(item.category)}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-muted-foreground w-8 text-right text-xs tabular-nums">
                      {pct.toFixed(0)}%
                    </span>
                    <span className="font-medium w-20 text-right text-xs tabular-nums">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                </div>
              );
            })}
            {data.length > 9 && (
              <p className="text-xs text-muted-foreground text-center pt-1">+{data.length - 9} категорій</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
