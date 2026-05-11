'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createGoalAction } from '../actions';
import type { Currency, GoalType } from '@/lib/api';

const TYPES = [
  { value: 'SAVING', label: 'Накопичення' },
  { value: 'DEBT_PAYOFF', label: 'Погашення боргу' },
  { value: 'INVESTMENT', label: 'Інвестиція' },
  { value: 'PURCHASE', label: 'Велика покупка' },
] satisfies ReadonlyArray<{ value: GoalType; label: string }>;

const CURRENCIES: Currency[] = ['UAH', 'USD', 'EUR', 'GBP', 'PLN'];

export function CreateGoalForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<GoalType>('SAVING');
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('UAH');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState(3);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Введіть назву цілі');
    if (!/^\d+(\.\d{1,2})?$/.test(targetAmount)) {
      return setError('Цільова сума у форматі 12345.67');
    }
    startTransition(async () => {
      try {
        const created = await createGoalAction({
          type,
          name: name.trim(),
          targetAmount,
          baseCurrency: currency,
          deadline: deadline || undefined,
          priority,
        });
        router.push(`/dashboard/goals/${created.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не вдалося створити ціль');
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="goal-name">Назва</Label>
        <Input
          id="goal-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Наприклад: Подушка безпеки"
          maxLength={120}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="goal-type">Тип</Label>
          <Select value={type} onValueChange={(v) => setType(v as GoalType)}>
            <SelectTrigger id="goal-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="goal-priority">Пріоритет (1 — найвищий)</Label>
          <Input
            id="goal-priority"
            type="number"
            min={1}
            max={5}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="goal-target">Цільова сума</Label>
          <Input
            id="goal-target"
            inputMode="decimal"
            required
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="50000"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-currency">Валюта</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger id="goal-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="goal-deadline">Дедлайн (опціонально)</Label>
        <Input
          id="goal-deadline"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Створюю…' : 'Створити ціль'}
      </Button>
    </form>
  );
}
