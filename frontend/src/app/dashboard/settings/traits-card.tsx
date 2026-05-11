'use client';

import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { recomputeTraitsAction } from './actions';
import type { UserProfileDto } from '@/lib/api';

const TRAIT_LABEL: Record<string, string> = {
  eveningSpenderScore: 'Вечірні витрати',
  weekendSpenderScore: 'Витрати у вихідні',
  impulsivityScore: 'Імпульсивність',
  plannerScore: 'Плановість',
};

const SEGMENT_LABEL: Record<string, string> = {
  COLD_START: 'Замало даних',
  METHODICAL_PLANNER: 'Методичний планувальник',
  IMPULSIVE_EVENING: 'Імпульсивний (вечір)',
  CHAOTIC_SPENDER: 'Хаотичний',
  BALANCED_REGULAR: 'Збалансований',
  EXPLORING: 'У пошуку шаблонів',
};

export function TraitsCard({ traits }: { traits: UserProfileDto['behavioralTraits'] }) {
  const [pending, startTransition] = useTransition();
  const segmentLabel = traits.segment ? (SEGMENT_LABEL[traits.segment] ?? traits.segment) : '—';
  const computedAt = traits.computedAt
    ? new Date(traits.computedAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted/30 p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Сегмент</p>
        <p className="mt-1 text-sm font-semibold">{segmentLabel}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {traits.observations} спостережень{computedAt ? ` · оновлено ${computedAt}` : ''}
        </p>
      </div>
      <ul className="space-y-2 text-xs">
        {(['eveningSpenderScore', 'weekendSpenderScore', 'impulsivityScore', 'plannerScore'] as const).map(
          (key) => {
            const value = traits[key];
            return (
              <li key={key}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-muted-foreground">{TRAIT_LABEL[key]}</span>
                  <span className="tabular-nums">{Math.round(value * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, value * 100)}%` }}
                  />
                </div>
              </li>
            );
          },
        )}
      </ul>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          startTransition(async () => {
            await recomputeTraitsAction();
          })
        }
        disabled={pending}
      >
        <RefreshCw className="mr-1 h-3.5 w-3.5" />
        {pending ? 'Перерахунок…' : 'Перерахувати'}
      </Button>
    </div>
  );
}
