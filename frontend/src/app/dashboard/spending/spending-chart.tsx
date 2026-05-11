'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { SpendingCategorySlice } from '@/lib/api';
import { DEFAULT_CATEGORY_COLOR } from '@/lib/constants';

interface Props {
  slices: SpendingCategorySlice[];
  currency: string;
}

const FALLBACK_PALETTE = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#64748b',
];

export function SpendingChart({ slices, currency }: Props) {
  const data = slices.map((s, i) => ({
    name: s.name,
    value: Number(s.amount),
    fill: s.color ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length] ?? DEFAULT_CATEGORY_COLOR,
  }));

  const formatter = new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatter.format(value)}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--card))',
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
