'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { refreshRecommendationsAction } from './actions';

export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);

  const onClick = () => {
    setInfo(null);
    startTransition(async () => {
      try {
        const result = await refreshRecommendationsAction();
        setInfo(
          `Згенеровано ${result.generated}, збережено ${result.persisted}, пропущено ${result.skipped}.`,
        );
      } catch (err) {
        setInfo(err instanceof Error ? err.message : 'Помилка');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" disabled={pending} onClick={onClick}>
        <Sparkles className="mr-1 h-3.5 w-3.5" />
        {pending ? 'Pipeline…' : 'Перерахувати'}
      </Button>
      {info && (
        <p className="max-w-xs text-right text-xs text-muted-foreground">{info}</p>
      )}
    </div>
  );
}
