'use client';

import {
  LineChart,
  Line,
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
import type { SpendingTrendItem } from '@/lib/types';

interface Props {
  data: SpendingTrendItem[];
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg min-w-[180px]">
      <p className="font-medium text-sm mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
            {p.name === 'amount' ? 'Витрати' : 'Ковзне сер. (7 д)'}
          </span>
          <span className="font-medium tabular-nums">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function SpendingTrendChart({ data }: Props) {
  const reducedMotion = useReducedMotion();

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Динаміка витрат</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">Немає даних</CardContent>
      </Card>
    );
  }

  // Show only every N-th label to avoid overcrowding
  const n = data.length > 60 ? 7 : data.length > 30 ? 4 : 1;
  const formatted = data.map((d, i) => ({
    label: i % n === 0 ? d.date.slice(5) : '',
    date: d.date.slice(5),
    amount: parseFloat(d.amount),
    movingAvg: parseFloat(d.movingAvg),
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Динаміка витрат</CardTitle>
          <span className="text-xs text-muted-foreground">пунктир — 7-денне середнє</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formatted}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-muted-foreground">
                    {value === 'amount' ? 'Витрати' : 'Ковзне сер. (7 д)'}
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="#ef4444"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={!reducedMotion}
              />
              <Line
                type="monotone"
                dataKey="movingAvg"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                isAnimationActive={!reducedMotion}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
