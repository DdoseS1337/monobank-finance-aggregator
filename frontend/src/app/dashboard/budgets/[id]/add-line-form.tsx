'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addBudgetLineAction } from '../actions';
import type { CategoryDto } from '@/lib/api';

interface Props {
  budgetId: string;
  categories: CategoryDto[];
  /** Category IDs already used in the active period — disabled in the picker. */
  usedCategoryIds: string[];
}

export function AddLineForm({ budgetId, categories, usedCategoryIds }: Props) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('__none');
  const [planned, setPlanned] = useState('');
  const [threshold, setThreshold] = useState('80');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const used = new Set(usedCategoryIds);

  // Build hierarchical labels so the picker shows "Авто › Паркінг" instead
  // of bare "Паркінг". Roots come first, then their children grouped beneath.
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const roots = categories
    .filter((c) => !c.parentSlug)
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  const childrenOf = (parentSlug: string) =>
    categories
      .filter((c) => c.parentSlug === parentSlug)
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  const ordered: Array<{ id: string; label: string }> = [];
  for (const root of roots) {
    ordered.push({ id: root.id, label: root.name });
    for (const child of childrenOf(root.slug)) {
      ordered.push({ id: child.id, label: `${root.name} › ${child.name}` });
    }
  }
  // Catch any orphans whose parent slug we don't have
  for (const c of categories) {
    if (ordered.some((o) => o.id === c.id)) continue;
    const parent = c.parentSlug ? bySlug.get(c.parentSlug) : null;
    ordered.push({
      id: c.id,
      label: parent ? `${parent.name} › ${c.name}` : c.name,
    });
  }

  const submit = () => {
    setError(null);
    if (!/^\d+(\.\d{1,2})?$/.test(planned)) {
      setError('Введіть суму у форматі 1234.56');
      return;
    }
    const thr = Number(threshold);
    if (!Number.isInteger(thr) || thr < 1 || thr > 100) {
      setError('Поріг — ціле число 1–100');
      return;
    }
    startTransition(async () => {
      try {
        await addBudgetLineAction({
          budgetId,
          categoryId: categoryId === '__none' ? null : categoryId,
          plannedAmount: planned,
          thresholdPct: thr,
        });
        setOpen(false);
        setPlanned('');
        setThreshold('80');
        setCategoryId('__none');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Помилка');
      }
    });
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Додати лінію
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Категорія
        </label>
        <Select value={categoryId} onValueChange={setCategoryId} disabled={pending}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Без категорії</SelectItem>
            {ordered.map((c) => (
              <SelectItem key={c.id} value={c.id} disabled={used.has(c.id)}>
                {c.label}
                {used.has(c.id) ? ' · вже додано' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          План
        </label>
        <Input
          value={planned}
          onChange={(e) => setPlanned(e.target.value)}
          placeholder="1000"
          inputMode="decimal"
          className="h-8 w-28"
          disabled={pending}
        />
      </div>
      <div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Поріг %
        </label>
        <Input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          inputMode="numeric"
          className="h-8 w-20"
          disabled={pending}
        />
      </div>
      <Button size="sm" onClick={submit} disabled={pending}>
        Додати
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        disabled={pending}
      >
        Скасувати
      </Button>
      {error && (
        <p className="w-full text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
