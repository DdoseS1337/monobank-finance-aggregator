'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProjectionPointDto } from '@/lib/api';

interface Props {
  points: ProjectionPointDto[];
}

interface ChartDatum {
  day: string;
  p10: number;
  p50: number;
  p90: number;
  // Recharts stacked area trick: render P10 + (P50−P10) + (P90−P50) so the
  // band visually lies between P10 and P90.
  bandLow: number;
  bandWidth: number;
}

/**
 * Cashflow trajectory chart.
 *
 *   - Area band: P10 → P90 (uncertainty corridor).
 *   - Line on top: P50 (median).
 *   - ReferenceLine y=0 highlights the "deficit" threshold.
 *
 * recharts is heavy (~150 KB) so this component is loaded lazily by the
 * page via next/dynamic to keep the initial JS budget small.
 */
export function TrajectoryChart({ points }: Props) {
  const data: ChartDatum[] = points.map((p) => {
    const p10 = Number(p.balanceP10);
    const p50 = Number(p.balanceP50);
    const p90 = Number(p.balanceP90);
    return {
      day: p.day,
      p10,
      p50,
      p90,
      bandLow: p10,
      bandWidth: Math.max(0, p90 - p10),
    };
  });

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="day"
            tickFormatter={(value: string) =>
              new Date(value).toLocaleDateString('uk-UA', {
                day: 'numeric',
                month: 'short',
              })
            }
            className="text-xs"
          />
          <YAxis
            tickFormatter={(value: number) =>
              new Intl.NumberFormat('uk-UA', {
                notation: 'compact',
                compactDisplay: 'short',
              }).format(value)
            }
            className="text-xs"
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(value) =>
              new Date(value as string).toLocaleDateString('uk-UA', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })
            }
            formatter={(value, name) => [
              new Intl.NumberFormat('uk-UA', {
                style: 'currency',
                currency: 'UAH',
                maximumFractionDigits: 0,
              }).format(typeof value === 'number' ? value : Number(value ?? 0)),
              labelOf(String(name ?? '')),
            ]}
          />
          <Area
            type="monotone"
            dataKey="bandLow"
            stackId="band"
            stroke="none"
            fill="transparent"
          />
          <Area
            type="monotone"
            dataKey="bandWidth"
            stackId="band"
            stroke="none"
            fill="hsl(var(--primary) / 0.18)"
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
          />
          <ReferenceLine
            y={0}
            stroke="hsl(var(--destructive))"
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function labelOf(key: string): string {
  switch (key) {
    case 'p50':
      return 'Медіана (P50)';
    case 'bandWidth':
      return 'Діапазон P10–P90';
    case 'bandLow':
      return 'P10';
    default:
      return key;
  }
}
