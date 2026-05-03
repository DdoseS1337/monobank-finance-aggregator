'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { DailySummary } from '@/lib/types';

interface IncomeExpenseBarProps {
  data: DailySummary[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="font-medium text-sm mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-sm text-muted-foreground">
          {p.name === 'income' ? 'Дохід' : 'Витрати'}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export function IncomeExpenseBar({ data }: IncomeExpenseBarProps) {
  const reducedMotion = useReducedMotion();

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Дохід та витрати</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
          Немає даних
        </CardContent>
      </Card>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    date: d.date.slice(5),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Дохід та витрати по днях</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formatted} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="income" fill="#22c55e" radius={[2, 2, 0, 0]} name="income" isAnimationActive={!reducedMotion} />
              <Bar dataKey="expense" fill="#ef4444" radius={[2, 2, 0, 0]} name="expense" isAnimationActive={!reducedMotion} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
