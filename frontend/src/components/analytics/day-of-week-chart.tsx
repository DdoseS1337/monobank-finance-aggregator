'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { DayOfWeekItem } from '@/lib/types';

const DAY_UK: Record<number, string> = {
  0: 'Нд', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб',
};

// Weekend days get a distinct color
const DAY_COLOR = (dow: number) => (dow === 0 || dow === 6 ? '#f97316' : '#3b82f6');

interface Props {
  data: DayOfWeekItem[];
}

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: DayOfWeekItem & { avg: number; total: number }; value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="font-medium text-sm mb-1">{DAY_UK[d.dayOfWeek]} ({d.dayName})</p>
      <p className="text-sm text-muted-foreground">Сер. витрата: <span className="text-foreground font-medium">{formatCurrency(d.avg)}</span></p>
      <p className="text-sm text-muted-foreground">Транзакцій: <span className="text-foreground font-medium">{d.count}</span></p>
    </div>
  );
}

export function DayOfWeekChart({ data }: Props) {
  const reducedMotion = useReducedMotion();

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Витрати по днях тижня</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">Немає даних</CardContent>
      </Card>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: DAY_UK[d.dayOfWeek] ?? d.dayName,
    avg: parseFloat(d.avgAmount),
    total: parseFloat(d.totalAmount),
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Витрати по днях тижня</CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Будні
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Вихідні
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formatted} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 13, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={44}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion}>
                {formatted.map((entry) => (
                  <Cell key={`cell-${entry.dayOfWeek}`} fill={DAY_COLOR(entry.dayOfWeek)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">середня сума витрат</p>
      </CardContent>
    </Card>
  );
}
