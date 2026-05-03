'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, getCategoryLabel } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { CategorySummary } from '@/lib/types';

interface SpendingChartProps {
  data: CategorySummary[];
  totalExpense: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CategorySummary }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="font-medium text-sm">{getCategoryLabel(item.category)}</p>
      <p className="text-sm text-muted-foreground">
        {formatCurrency(item.total)} ({item.percentage}%)
      </p>
    </div>
  );
}

export function SpendingChart({ data, totalExpense }: SpendingChartProps) {
  const reducedMotion = useReducedMotion();

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Витрати за категоріями</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
          Немає даних
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Витрати за категоріями</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row items-center gap-6">
          <div className="relative w-64 h-64 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={105}
                  dataKey="total"
                  nameKey="category"
                  strokeWidth={3}
                  stroke="hsl(var(--background))"
                  animationBegin={0}
                  animationDuration={800}
                  isAnimationActive={!reducedMotion}
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.category}
                      fill={CATEGORY_COLORS[entry.category] || DEFAULT_CATEGORY_COLOR}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-xs text-muted-foreground">Всього</p>
              <p className="text-lg font-bold">{formatCurrency(totalExpense)}</p>
            </div>
          </div>

          <div className="flex-1 space-y-1.5 w-full">
            {data.slice(0, 10).map((item) => {
              const color = CATEGORY_COLORS[item.category] || DEFAULT_CATEGORY_COLOR;
              return (
                <div key={item.category} className="flex items-center gap-3 text-sm group">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate flex-1">{getCategoryLabel(item.category)}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${item.percentage}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">{item.percentage}%</span>
                    <span className="font-medium w-24 text-right tabular-nums">{formatCurrency(item.total)}</span>
                  </div>
                </div>
              );
            })}
            {data.length > 10 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{data.length - 10} категорій
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
