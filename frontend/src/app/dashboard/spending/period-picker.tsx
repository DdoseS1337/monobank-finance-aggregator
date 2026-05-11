'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const OPTIONS = [
  { value: 'month', label: 'Цей місяць' },
  { value: 'prev_month', label: 'Минулий місяць' },
  { value: '7', label: 'Останні 7 днів' },
  { value: '30', label: 'Останні 30 днів' },
  { value: '90', label: 'Останні 90 днів' },
  { value: '180', label: 'Останні 6 місяців' },
  { value: '365', label: 'Останній рік' },
] as const;

export function PeriodPicker({ initial }: { initial: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={initial}
      disabled={pending}
      onValueChange={(value) => {
        const next = new URLSearchParams(params.toString());
        next.set('period', value);
        startTransition(() => router.push(`?${next.toString()}`));
      }}
    >
      <SelectTrigger size="sm" className="w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
