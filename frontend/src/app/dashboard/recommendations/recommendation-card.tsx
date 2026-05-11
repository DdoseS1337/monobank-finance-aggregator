'use client';

import { useState, useTransition } from 'react';
import { Check, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/shared/money-display';
import { cn } from '@/lib/utils';
import {
  acceptRecommendationAction,
  rejectRecommendationAction,
  snoozeRecommendationAction,
} from './actions';
import type { RecommendationDto } from '@/lib/api';

const KIND_LABEL: Record<RecommendationDto['kind'], string> = {
  SPENDING: 'Витрати',
  SAVING: 'Заощадження',
  SUBSCRIPTION: 'Підписка',
  BUDGET: 'Бюджет',
  GOAL: 'Ціль',
  CASHFLOW: 'Cashflow',
  BEHAVIORAL: 'Поведінка',
};

const PRIORITY_DOT: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-primary',
  4: 'bg-muted-foreground/40',
};

interface Props {
  recommendation: RecommendationDto;
}

export function RecommendationCard({ recommendation: r }: Props) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<null | 'ACCEPTED' | 'REJECTED' | 'SNOOZED'>(null);

  const onAccept = () => {
    startTransition(async () => {
      await acceptRecommendationAction(r.id);
      setDone('ACCEPTED');
    });
  };
  const onReject = () => {
    startTransition(async () => {
      await rejectRecommendationAction(r.id);
      setDone('REJECTED');
    });
  };
  const onSnooze = () => {
    startTransition(async () => {
      await snoozeRecommendationAction(r.id, 24);
      setDone('SNOOZED');
    });
  };

  if (done) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
        Дякуємо. Реакція збережена ({DECISION_LABEL[done]}).
      </div>
    );
  }

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[r.priority] ?? 'bg-muted-foreground')} />
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase text-primary">
            {KIND_LABEL[r.kind]}
          </span>
          <span className="text-xs text-muted-foreground">
            {r.generatedBy === 'rules'
              ? 'rule-based'
              : r.generatedBy === 'llm'
                ? 'llm'
                : r.generatedBy}
          </span>
          {r.ranking && (
            <span className="text-xs text-muted-foreground">
              · score {r.ranking.total.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onSnooze} disabled={pending}>
            <Clock className="mr-1 h-3.5 w-3.5" /> 24h
          </Button>
          <Button size="sm" variant="outline" onClick={onReject} disabled={pending}>
            <X className="mr-1 h-3.5 w-3.5" /> Ні
          </Button>
          <Button size="sm" onClick={onAccept} disabled={pending}>
            <Check className="mr-1 h-3.5 w-3.5" /> Прийняти
          </Button>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed">{r.explanation}</p>

      {r.expectedImpact?.financial && (
        <p className="mt-3 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600">
          Очікуваний impact:{' '}
          <MoneyDisplay
            amount={r.expectedImpact.financial.amount}
            currency={r.expectedImpact.financial.currency}
          />
          {r.expectedImpact.timeframe && ` · ${r.expectedImpact.timeframe}`}
        </p>
      )}

      {r.ranking && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Чому саме ця рекомендація?
          </summary>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['utility', 'urgency', 'novelty', 'userFit'] as const).map((k) => (
              <div key={k} className="rounded-md bg-muted/30 p-2">
                <dt className="text-muted-foreground">{LABELS[k]}</dt>
                <dd className="font-medium tabular-nums">
                  {(r.ranking!.breakdown[k] * 100).toFixed(0)}%
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </article>
  );
}

const DECISION_LABEL: Record<'ACCEPTED' | 'REJECTED' | 'SNOOZED', string> = {
  ACCEPTED: 'Прийнято',
  REJECTED: 'Відхилено',
  SNOOZED: 'Відкладено на 24 год.',
};

const LABELS = {
  utility: 'Користь',
  urgency: 'Терміновість',
  novelty: 'Новизна',
  userFit: 'Релевантність',
} as const;
