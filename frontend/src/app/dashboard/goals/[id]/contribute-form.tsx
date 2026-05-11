'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { contributeAction } from '../actions';

interface Props {
  goalId: string;
  currency: string;
  disabled: boolean;
}

export function ContributeForm({ goalId, currency, disabled }: Props) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      setError('Сума у форматі 1234.56');
      return;
    }
    startTransition(async () => {
      try {
        await contributeAction(goalId, amount);
        setAmount('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Помилка');
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[180px] space-y-1">
        <label htmlFor="contribute-amount" className="text-xs text-muted-foreground">
          Сума ({currency})
        </label>
        <Input
          id="contribute-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1500"
          disabled={disabled}
        />
      </div>
      <Button type="submit" disabled={pending || disabled || !amount}>
        {pending ? 'Записую…' : 'Додати'}
      </Button>
      {error && (
        <p className="w-full text-xs text-destructive">{error}</p>
      )}
      {disabled && (
        <p className="w-full text-xs text-muted-foreground">
          Внески недоступні для неактивних цілей.
        </p>
      )}
    </form>
  );
}
