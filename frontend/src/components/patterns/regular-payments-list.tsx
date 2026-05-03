'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getCategoryLabel } from '@/lib/constants';
import type { RegularPayment } from '@/lib/types';

interface Props {
  payments: RegularPayment[];
}

export function RegularPaymentsList({ payments }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Регулярні платежі</CardTitle>
        <p className="text-sm text-muted-foreground">
          Платежі з повторюваним інтервалом (confidence — точність прогнозу)
        </p>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            Регулярних платежів не виявлено.
          </p>
        ) : (
          <div className="space-y-2">
            {payments.slice(0, 20).map((p) => (
              <div
                key={p.merchant}
                className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.merchant}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.category ? getCategoryLabel(p.category) : 'Без категорії'} ·{' '}
                    кожні ~{p.avgIntervalDays} днів · {p.transactionCount} разів
                  </p>
                  {p.nextExpectedDate && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Очікується ~{formatDate(p.nextExpectedDate)}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold tabular-nums">
                    {formatCurrency(p.avgAmount)}
                  </p>
                  <ConfidenceBar value={p.confidence} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.8 ? 'bg-green-500' : value >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 mt-1 justify-end">
      <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}
