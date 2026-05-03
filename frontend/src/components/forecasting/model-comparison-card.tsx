'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ModelComparisonItem } from '@/lib/types';

const MODEL_LABELS: Record<string, string> = {
  moving_average: 'Ковзке середнє',
  linear_trend: 'Лінійний тренд',
  seasonal_naive: 'Сезонний наїв',
  exponential_smoothing: 'Holt смугове',
  ensemble: 'Ансамбль',
};

interface Props {
  models: ModelComparisonItem[];
}

export function ModelComparisonCard({ models }: Props) {
  if (models.length === 0) return null;
  const best = models[0];
  const maxMape = Math.max(...models.map((m) => parseFloat(m.mape)));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Порівняння моделей</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Середня абсолютна % помилка (MAPE) на історичних даних. Менше = краще.
            </p>
          </div>
          <Badge variant="outline" className="text-primary border-primary/30">
            Найкраща: {MODEL_LABELS[best.model]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {models.map((m, i) => {
            const mape = parseFloat(m.mape);
            const widthPct = maxMape > 0 ? (mape / maxMape) * 100 : 0;
            return (
              <div key={m.model} className="flex items-center gap-3">
                <div className="w-36 text-sm">
                  {MODEL_LABELS[m.model] ?? m.model}
                  {i === 0 && (
                    <span className="ml-1.5 text-xs text-primary">★</span>
                  )}
                </div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="w-16 text-right text-xs tabular-nums">
                  {m.mape}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
