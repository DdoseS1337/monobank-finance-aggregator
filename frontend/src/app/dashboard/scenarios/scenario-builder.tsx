'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { createScenarioAction } from './actions';
import type { ScenarioVariable } from '@/lib/api';

type EditableVariable =
  | { kind: 'INCOME_DELTA'; deltaMonthly: string; reason?: string }
  | { kind: 'CATEGORY_DELTA'; categorySlug: string; deltaPct: string }
  | { kind: 'NEW_RECURRING'; amountMonthly: string; sign: 'INFLOW' | 'OUTFLOW'; description: string };

const KINDS = [
  { value: 'INCOME_DELTA', label: '+/- щомісячний дохід' },
  { value: 'CATEGORY_DELTA', label: 'Зміна категорії на %' },
  { value: 'NEW_RECURRING', label: 'Нова рекурентна транзакція' },
] as const;

function defaultFor(kind: (typeof KINDS)[number]['value']): EditableVariable {
  switch (kind) {
    case 'INCOME_DELTA':
      return { kind: 'INCOME_DELTA', deltaMonthly: '5000' };
    case 'CATEGORY_DELTA':
      return { kind: 'CATEGORY_DELTA', categorySlug: 'food', deltaPct: '-20' };
    case 'NEW_RECURRING':
      return {
        kind: 'NEW_RECURRING',
        amountMonthly: '2000',
        sign: 'OUTFLOW',
        description: 'Нова підписка',
      };
  }
}

function toScenarioVariable(v: EditableVariable): ScenarioVariable | null {
  switch (v.kind) {
    case 'INCOME_DELTA': {
      const num = Number(v.deltaMonthly);
      if (!Number.isFinite(num)) return null;
      return { kind: 'INCOME_DELTA', deltaMonthly: num, reason: v.reason };
    }
    case 'CATEGORY_DELTA': {
      const pct = Number(v.deltaPct);
      if (!Number.isFinite(pct)) return null;
      return { kind: 'CATEGORY_DELTA', categorySlug: v.categorySlug.trim(), deltaPct: pct };
    }
    case 'NEW_RECURRING': {
      const num = Number(v.amountMonthly);
      if (!Number.isFinite(num) || !v.description.trim()) return null;
      return {
        kind: 'NEW_RECURRING',
        amountMonthly: num,
        sign: v.sign,
        description: v.description.trim(),
      };
    }
  }
}

export function ScenarioBuilder() {
  const [name, setName] = useState('Сценарій');
  const [vars, setVars] = useState<EditableVariable[]>([defaultFor('INCOME_DELTA')]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addVar = () => setVars((arr) => [...arr, defaultFor('INCOME_DELTA')]);
  const removeVar = (i: number) =>
    setVars((arr) => arr.filter((_, idx) => idx !== i));
  const updateVar = (i: number, next: EditableVariable) =>
    setVars((arr) => arr.map((v, idx) => (idx === i ? next : v)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Дайте сценарію назву');
    if (vars.length === 0) return setError('Додайте хоча б одну змінну');
    const compiled = vars.map(toScenarioVariable);
    if (compiled.some((v) => v === null)) {
      return setError('Деякі поля порожні або некоректні');
    }
    startTransition(async () => {
      try {
        await createScenarioAction({
          name: name.trim(),
          variables: compiled.filter((v): v is ScenarioVariable => v !== null),
        });
        setVars([defaultFor('INCOME_DELTA')]);
        setName('Сценарій');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Помилка');
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="space-y-2">
        <Label htmlFor="scn-name">Назва</Label>
        <Input
          id="scn-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Напр.: Підвищення зарплати + нова ціль"
          maxLength={120}
        />
      </div>

      <div className="space-y-3">
        {vars.map((v, i) => (
          <VariableRow
            key={i}
            value={v}
            onChange={(next) => updateVar(i, next)}
            onRemove={() => removeVar(i)}
            removable={vars.length > 1}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addVar}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Додати змінну
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Симуляція…' : 'Запустити симуляцію'}
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
    </form>
  );
}

interface RowProps {
  value: EditableVariable;
  onChange: (next: EditableVariable) => void;
  onRemove: () => void;
  removable: boolean;
}

function VariableRow({ value, onChange, onRemove, removable }: RowProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <Select
          value={value.kind}
          onValueChange={(v) => onChange(defaultFor(v as (typeof KINDS)[number]['value']))}
        >
          <SelectTrigger className="h-8 w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {removable && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {value.kind === 'INCOME_DELTA' && (
          <>
            <LabeledInput
              label="Δ дохід / міс."
              value={value.deltaMonthly}
              onChange={(v) =>
                onChange({ ...value, deltaMonthly: v })
              }
              placeholder="5000 або -3000"
              inputMode="decimal"
            />
            <LabeledInput
              label="Причина (опц.)"
              value={value.reason ?? ''}
              onChange={(v) => onChange({ ...value, reason: v || undefined })}
              placeholder="Підвищення"
            />
          </>
        )}
        {value.kind === 'CATEGORY_DELTA' && (
          <>
            <LabeledInput
              label="Slug категорії"
              value={value.categorySlug}
              onChange={(v) => onChange({ ...value, categorySlug: v })}
              placeholder="food"
            />
            <LabeledInput
              label="Дельта, %"
              value={value.deltaPct}
              onChange={(v) => onChange({ ...value, deltaPct: v })}
              placeholder="-20 або 15"
              inputMode="decimal"
            />
          </>
        )}
        {value.kind === 'NEW_RECURRING' && (
          <>
            <LabeledInput
              label="Опис"
              value={value.description}
              onChange={(v) => onChange({ ...value, description: v })}
              placeholder="Нова підписка"
            />
            <LabeledInput
              label="Сума / міс."
              value={value.amountMonthly}
              onChange={(v) => onChange({ ...value, amountMonthly: v })}
              placeholder="2000"
              inputMode="decimal"
            />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Напрям</p>
              <Select
                value={value.sign}
                onValueChange={(v) =>
                  onChange({ ...value, sign: v as 'INFLOW' | 'OUTFLOW' })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUTFLOW">Витрата</SelectItem>
                  <SelectItem value="INFLOW">Дохід</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: 'decimal' | 'text';
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="h-8"
      />
    </div>
  );
}
