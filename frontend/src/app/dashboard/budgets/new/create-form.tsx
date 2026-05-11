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
import { createBudgetAction } from '../actions';

const METHODS = [
  { value: 'CATEGORY', label: 'Категорійний — окрема ціль на кожну категорію' },
  { value: 'ENVELOPE', label: 'Envelope — фіксована сума на envelope' },
  { value: 'ZERO_BASED', label: 'Zero-based — кожна гривня має призначення' },
  { value: 'PAY_YOURSELF_FIRST', label: 'Pay-yourself-first — спершу заощадження' },
] as const;

const CADENCES = [
  { value: 'WEEKLY', label: 'Тиждень' },
  { value: 'MONTHLY', label: 'Місяць' },
  { value: 'CUSTOM', label: 'Власний (задається пізніше)' },
] as const;

const CURRENCIES = ['UAH', 'USD', 'EUR', 'GBP', 'PLN'] as const;

export function CreateBudgetForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]['value']>('CATEGORY');
  const [cadence, setCadence] = useState<(typeof CADENCES)[number]['value']>('MONTHLY');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('UAH');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Дайте бюджету назву');
      return;
    }
    startTransition(async () => {
      try {
        const created = await createBudgetAction({
          name: name.trim(),
          method,
          cadence,
          baseCurrency: currency,
          startNow: true,
        });
        router.push(`/dashboard/budgets/${created.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не вдалося створити бюджет');
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="budget-name">Назва</Label>
        <Input
          id="budget-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Наприклад: Місячний — серпень"
          maxLength={120}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="budget-method">Метод</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
            <SelectTrigger id="budget-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="budget-cadence">Цикл</Label>
          <Select value={cadence} onValueChange={(v) => setCadence(v as typeof cadence)}>
            <SelectTrigger id="budget-cadence">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CADENCES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="budget-currency">Валюта</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as typeof currency)}>
            <SelectTrigger id="budget-currency">
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

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Створюю…' : 'Створити бюджет'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Перший період відкриється одразу. Лінії додасте на сторінці бюджету.
        </p>
      </div>
    </form>
  );
}
