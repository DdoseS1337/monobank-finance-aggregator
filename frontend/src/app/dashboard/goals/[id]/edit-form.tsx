'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adjustDeadlineAction, adjustTargetAction } from '../actions';

interface Props {
  goalId: string;
  currency: string;
  currentDeadline: string | null;
  currentTarget: string | number;
  disabled: boolean;
}

function toDateInputValue(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function EditGoalForm({
  goalId,
  currency,
  currentDeadline,
  currentTarget,
  disabled,
}: Props) {
  const [deadline, setDeadline] = useState(toDateInputValue(currentDeadline));
  const [target, setTarget] = useState(String(currentTarget));
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [deadlineMsg, setDeadlineMsg] = useState<string | null>(null);
  const [targetMsg, setTargetMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submitDeadline = (e: React.FormEvent) => {
    e.preventDefault();
    setDeadlineError(null);
    setDeadlineMsg(null);
    const payload = deadline ? new Date(`${deadline}T00:00:00Z`).toISOString() : null;
    startTransition(async () => {
      try {
        await adjustDeadlineAction(goalId, payload);
        setDeadlineMsg(payload ? 'Дедлайн оновлено.' : 'Дедлайн прибрано.');
      } catch (err) {
        setDeadlineError(err instanceof Error ? err.message : 'Помилка');
      }
    });
  };

  const clearDeadline = () => {
    setDeadline('');
    setDeadlineError(null);
    setDeadlineMsg(null);
    startTransition(async () => {
      try {
        await adjustDeadlineAction(goalId, null);
        setDeadlineMsg('Дедлайн прибрано.');
      } catch (err) {
        setDeadlineError(err instanceof Error ? err.message : 'Помилка');
      }
    });
  };

  const submitTarget = (e: React.FormEvent) => {
    e.preventDefault();
    setTargetError(null);
    setTargetMsg(null);
    if (!/^\d+(\.\d{1,2})?$/.test(target)) {
      setTargetError('Сума у форматі 1234.56');
      return;
    }
    startTransition(async () => {
      try {
        await adjustTargetAction(goalId, target);
        setTargetMsg('Цільову суму оновлено.');
      } catch (err) {
        setTargetError(err instanceof Error ? err.message : 'Помилка');
      }
    });
  };

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <form onSubmit={submitDeadline} className="space-y-2">
        <label htmlFor="goal-deadline" className="text-xs text-muted-foreground">
          Дедлайн
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="goal-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            disabled={disabled || pending}
            className="max-w-[180px]"
          />
          <Button type="submit" size="sm" disabled={disabled || pending}>
            {pending ? 'Зберігаю…' : 'Зберегти'}
          </Button>
          {currentDeadline && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearDeadline}
              disabled={disabled || pending}
            >
              Прибрати
            </Button>
          )}
        </div>
        {deadlineError && <p className="text-xs text-destructive">{deadlineError}</p>}
        {deadlineMsg && <p className="text-xs text-muted-foreground">{deadlineMsg}</p>}
      </form>

      <form onSubmit={submitTarget} className="space-y-2">
        <label htmlFor="goal-target" className="text-xs text-muted-foreground">
          Цільова сума ({currency})
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="goal-target"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={disabled || pending}
            className="max-w-[180px]"
          />
          <Button type="submit" size="sm" disabled={disabled || pending}>
            {pending ? 'Зберігаю…' : 'Зберегти'}
          </Button>
        </div>
        {targetError && <p className="text-xs text-destructive">{targetError}</p>}
        {targetMsg && <p className="text-xs text-muted-foreground">{targetMsg}</p>}
      </form>

      {disabled && (
        <p className="md:col-span-2 text-xs text-muted-foreground">
          Редагування доступне лише для активних цілей.
        </p>
      )}
    </div>
  );
}
