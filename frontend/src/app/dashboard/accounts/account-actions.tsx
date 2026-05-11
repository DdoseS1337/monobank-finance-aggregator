'use client';

import { useState, useTransition } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { backfillAction, unlinkAction } from './actions';

const PERIOD_OPTIONS = [
  { value: '7', label: '7 днів' },
  { value: '31', label: '31 день' },
  { value: '90', label: '3 місяці' },
  { value: '180', label: '6 місяців' },
  { value: '365', label: '1 рік' },
] as const;

export function AccountActions({ accountId }: { accountId: string }) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('31');

  const periodLabel =
    PERIOD_OPTIONS.find((opt) => opt.value === period)?.label ?? `${period} днів`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={setPeriod} disabled={pending}>
          <SelectTrigger size="sm" className="w-35">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await backfillAction(accountId, Number(period));
              setInfo(
                `Запит імпорту за ${periodLabel} відправлено. Через хвилину дані з'являться у транзакціях.`,
              );
            })
          }
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          Імпортувати
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            if (!confirm('Відключити рахунок? Транзакції залишаться в історії.')) return;
            startTransition(() => unlinkAction(accountId));
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {info && <p className="text-xs text-muted-foreground">{info}</p>}
    </div>
  );
}
