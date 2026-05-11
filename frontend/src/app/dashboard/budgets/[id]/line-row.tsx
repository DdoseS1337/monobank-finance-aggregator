'use client';

import { useState, useTransition } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { adjustBudgetLineAction, removeBudgetLineAction } from '../actions';
import { MoneyDisplay } from '@/components/shared/money-display';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BudgetLineDto } from '@/lib/api';

interface Props {
  budgetId: string;
  line: BudgetLineDto;
  currency: string;
}

const STATUS_BG: Record<BudgetLineDto['status'], string> = {
  OK: 'bg-emerald-500',
  WARNING: 'bg-amber-500',
  EXCEEDED: 'bg-red-500',
};

export function LineRow({ budgetId, line, currency }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(line.plannedAmount);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!/^\d+(\.\d{1,2})?$/.test(draft)) return;
    startTransition(async () => {
      await adjustBudgetLineAction({
        budgetId,
        lineId: line.id,
        newPlannedAmount: draft,
      });
      setEditing(false);
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate font-medium">
            {line.categoryName ?? 'Без категорії'}
          </span>
          <span className="tabular-nums text-muted-foreground">
            <MoneyDisplay amount={line.spentAmount} currency={currency} /> /{' '}
            <MoneyDisplay amount={line.plannedAmount} currency={currency} />
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full', STATUS_BG[line.status])}
            style={{ width: `${Math.min(100, line.spentPct)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {line.spentPct}% витрачено · поріг {line.thresholdPct}%
        </p>
      </div>

      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            inputMode="decimal"
            pattern="^\\d+(\\.\\d{1,2})?$"
            className="h-8 w-28"
          />
          <Button
            size="sm"
            variant="default"
            disabled={pending}
            onClick={submit}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(line.plannedAmount);
              setEditing(false);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            className="text-muted-foreground"
            disabled={pending}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const label = line.categoryName ?? 'без категорії';
              if (!confirm(`Видалити лінію бюджету «${label}»?`)) return;
              startTransition(async () => {
                await removeBudgetLineAction({
                  budgetId,
                  lineId: line.id,
                });
              });
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </li>
  );
}
