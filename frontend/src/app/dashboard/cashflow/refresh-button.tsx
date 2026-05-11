'use client';

import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { refreshCashflowAction } from './actions';

export function RefreshButton({ hasProjection }: { hasProjection: boolean }) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);

  const onClick = () => {
    setInfo(null);
    startTransition(async () => {
      try {
        const result = await refreshCashflowAction({ horizonDays: 60, trials: 1000 });
        setInfo(
          `Готово. Імовірність дефіциту: ${(result.deficitProbability * 100).toFixed(1)}% (${result.trialsRun} симуляцій).`,
        );
      } catch (err) {
        setInfo(err instanceof Error ? err.message : 'Помилка прогнозу');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={onClick} disabled={pending} size="sm" variant="outline">
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        {pending ? 'Симуляція…' : hasProjection ? 'Перерахувати' : 'Запустити прогноз'}
      </Button>
      {info && <p className="max-w-xs text-right text-xs text-muted-foreground">{info}</p>}
    </div>
  );
}
