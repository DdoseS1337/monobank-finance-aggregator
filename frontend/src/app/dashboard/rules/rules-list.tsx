'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { deleteRuleAction, toggleRuleAction } from './actions';
import type { RuleDto } from '@/lib/api';

export function RulesList({ rules }: { rules: RuleDto[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <ul className="space-y-2">
      {rules.map((r) => (
        <li
          key={r.id}
          className={cn(
            'rounded-xl border border-border bg-card p-4 text-sm',
            !r.enabled && 'opacity-60',
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{r.name}</p>
              {r.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Пріоритет {r.priority} · виконувалось {r.executionCount} раз
                {r.lastExecutedAt
                  ? ` · востаннє ${new Date(r.lastExecutedAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => startTransition(() => toggleRuleAction(r.id, !r.enabled))}
              >
                {r.enabled ? 'Вимкнути' : 'Увімкнути'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Видалити правило "${r.name}"?`)) return;
                  startTransition(() => deleteRuleAction(r.id));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
