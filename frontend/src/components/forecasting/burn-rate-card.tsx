'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { BurnRate } from '@/lib/types';

interface Props {
  data: BurnRate;
}

export function BurnRateCard({ data }: Props) {
  const daysUntil = data.daysUntilEmpty;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>Burn Rate</CardTitle>
          {data.sustainable ? (
            <Badge variant="outline" className="text-green-400 border-green-400/30">
              Стабільно
            </Badge>
          ) : (
            <Badge variant="outline" className="text-red-400 border-red-400/30">
              Витрати &gt; доходів
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Metric
            label="Витрати/день"
            value={formatCurrency(data.avgDailyBurn)}
            color="text-red-400"
          />
          <Metric
            label="Дохід/день"
            value={formatCurrency(data.avgDailyIncome)}
            color="text-green-400"
          />
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Чистий burn/день</p>
          <p
            className={`text-2xl font-bold tabular-nums mt-1 ${
              data.sustainable ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {data.sustainable ? '+' : '−'}
            {formatCurrency(Math.abs(parseFloat(data.netDailyBurn)))}
          </p>
        </div>

        {data.sustainable ? (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
            <p className="text-sm text-green-400 font-medium">
              Ваші доходи покривають витрати — баланс не зменшується
            </p>
          </div>
        ) : daysUntil !== null ? (
          <div
            className={`rounded-lg p-3 border ${
              daysUntil < 30
                ? 'bg-red-500/10 border-red-500/20'
                : daysUntil < 90
                ? 'bg-yellow-500/10 border-yellow-500/20'
                : 'bg-blue-500/10 border-blue-500/20'
            }`}
          >
            <p className="text-xs text-muted-foreground">
              При поточному темпі гроші закінчаться через
            </p>
            <p className="text-2xl font-bold tabular-nums mt-1">
              {daysUntil} днів
            </p>
            {data.projectedEmptyDate && (
              <p className="text-xs text-muted-foreground mt-1">
                ~{formatDate(data.projectedEmptyDate)}
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({
  label, value, color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  );
}
