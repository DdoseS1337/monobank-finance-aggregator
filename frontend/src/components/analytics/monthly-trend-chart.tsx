'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { MonthlyTrendItem } from '@/lib/types';

const MONTH_SHORT: Record<number, string> = {
  1: 'Січ', 2: 'Лют', 3: 'Бер', 4: 'Кві', 5: 'Тра', 6: 'Чер',
  7: 'Лип', 8: 'Сер', 9: 'Вер', 10: 'Жов', 11: 'Лис', 12: 'Гру',
};

interface Props {
  data: MonthlyTrendItem[];
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg min-w-[160px]">
      <p className="font-medium text-sm mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
            {p.name === 'totalIncome' ? 'Дохід' : 'Витрати'}
          </span>
          <span className="font-medium tabular-nums">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function MonthlyTrendChart({ data }: Props) {
  const reducedMotion = useReducedMotion();

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Дохід та витрати по місяцях</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">Немає даних</CardContent>
      </Card>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    totalExpense: parseFloat(d.totalExpense),
    totalIncome: parseFloat(d.totalIncome),
    label: `${MONTH_SHORT[d.month]} ${d.year !== new Date().getFullYear() ? d.year : ''}`.trim(),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Дохід та витрати по місяцях</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formatted} barGap={4} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-muted-foreground">
                    {value === 'totalIncome' ? 'Дохід' : 'Витрати'}
                  </span>
                )}
              />
              <Bar dataKey="totalIncome" fill="#22c55e" radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} />
              <Bar dataKey="totalExpense" fill="#ef4444" radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
