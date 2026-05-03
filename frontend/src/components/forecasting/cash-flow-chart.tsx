'use client';

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { CashFlowForecast } from '@/lib/types';

interface Props {
  data: CashFlowForecast;
}

function Tt({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; dataKey: string; payload: { isPredicted: boolean } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const predicted = payload.find((p) => p.dataKey === 'predicted');
  const band = payload.find((p) => p.dataKey === 'band');
  const lower = payload.find((p) => p.dataKey === 'lower');
  const isForecast = predicted?.payload.isPredicted;

  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg min-w-[200px]">
      <p className="font-medium text-sm mb-2">
        {label} {isForecast && <span className="text-xs text-primary ml-1">прогноз</span>}
      </p>
      {predicted && (
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">Баланс</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(predicted.value)}
          </span>
        </div>
      )}
      {isForecast && band && lower && (
        <div className="flex items-center justify-between gap-4 text-xs mt-1">
          <span className="text-muted-foreground">80% діапазон</span>
          <span className="tabular-nums text-muted-foreground">
            {formatCurrency(lower.value)} — {formatCurrency(lower.value + band.value)}
          </span>
        </div>
      )}
    </div>
  );
}

export function CashFlowChart({ data }: Props) {
  const reducedMotion = useReducedMotion();

  const allPoints = [...data.history, ...data.forecast];
  const splitIndex = data.history.length;

  const formatted = allPoints.map((p) => ({
    date: p.date.slice(5),
    predicted: parseFloat(p.predicted),
    lower: parseFloat(p.lowerBound),
    // Stacked band: bottom is `lower`, band height is (upper - lower)
    band: parseFloat(p.upperBound) - parseFloat(p.lowerBound),
    isPredicted: p.isPredicted,
  }));

  const n = formatted.length > 60 ? 10 : formatted.length > 30 ? 5 : 3;
  const ticks = formatted
    .map((d, i) => (i % n === 0 || i === formatted.length - 1 ? d.date : null))
    .filter((x): x is string => x !== null);

  const splitDate = formatted[splitIndex]?.date;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Прогноз балансу</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Історичні дані + {data.forecast.length} днів прогнозу
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">Модель: {data.model}</Badge>
            <Badge variant="outline">MAPE: {data.accuracyMape}%</Badge>
            {data.willRunOut && (
              <Badge variant="destructive">
                Закінчаться {data.runOutDate}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={formatted}>
              <defs>
                <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                ticks={ticks}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) =>
                  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
                width={55}
              />
              <Tooltip content={<Tt />} cursor={{ stroke: 'hsl(var(--border))' }} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-muted-foreground">
                    {value === 'predicted'
                      ? 'Баланс'
                      : value === 'band'
                      ? '80% довірчий інтервал'
                      : value}
                  </span>
                )}
              />

              {/* Lower bound — invisible, serves as stack base */}
              <Area
                type="monotone"
                dataKey="lower"
                stackId="ci"
                stroke="none"
                fill="transparent"
                isAnimationActive={!reducedMotion}
                legendType="none"
              />
              {/* Band (upper - lower) — the visible confidence interval */}
              <Area
                type="monotone"
                dataKey="band"
                stackId="ci"
                stroke="none"
                fill="url(#bandGradient)"
                isAnimationActive={!reducedMotion}
              />

              {/* Zero line */}
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />

              {/* Split line between history and forecast */}
              {splitDate && (
                <ReferenceLine
                  x={splitDate}
                  stroke="#f59e0b"
                  strokeDasharray="4 3"
                  label={{
                    value: 'зараз',
                    position: 'top',
                    fill: '#f59e0b',
                    fontSize: 10,
                  }}
                />
              )}

              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                isAnimationActive={!reducedMotion}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
