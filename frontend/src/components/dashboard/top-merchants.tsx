'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { Transaction } from '@/lib/types';

interface TopMerchantsProps {
  transactions: Transaction[];
}

export function TopMerchants({ transactions }: TopMerchantsProps) {
  const merchants = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const tx of transactions) {
      if (tx.transactionType !== 'DEBIT') continue;
      const name = tx.merchantNameClean || tx.descriptionRaw;
      if (!name) continue;
      const existing = map.get(name) || { total: 0, count: 0 };
      existing.total += Math.abs(parseFloat(tx.amount));
      existing.count += 1;
      map.set(name, existing);
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);
  }, [transactions]);

  const maxTotal = merchants[0]?.total || 1;

  if (merchants.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Топ витрати</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">
          Немає даних
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Топ витрати</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {merchants.map((m, i) => (
          <div key={m.name} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                <span className="truncate font-medium">{m.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-xs text-muted-foreground">{m.count}x</span>
                <span className="font-semibold text-red-400 w-28 text-right tabular-nums">
                  {formatCurrency(m.total)}
                </span>
              </div>
            </div>
            <div className="ml-7 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-red-400/60 transition-all"
                style={{ width: `${(m.total / maxTotal) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
