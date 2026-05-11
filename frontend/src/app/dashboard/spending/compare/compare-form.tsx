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

interface Initial {
  fromA: string;
  toA: string;
  fromB: string;
  toB: string;
  groupBy: 'merchant' | 'category';
}

export function CompareForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(initial);

  const apply = () => {
    const params = new URLSearchParams({
      fromA: state.fromA,
      toA: state.toA,
      fromB: state.fromB,
      toB: state.toB,
      groupBy: state.groupBy,
    });
    startTransition(() => router.push(`?${params.toString()}`));
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <div>
          <Label className="mb-1 text-xs text-muted-foreground">
            Базовий період (A)
          </Label>
          <div className="flex gap-1">
            <Input
              type="date"
              value={state.fromA}
              onChange={(e) =>
                setState((s) => ({ ...s, fromA: e.target.value }))
              }
              disabled={pending}
            />
            <Input
              type="date"
              value={state.toA}
              onChange={(e) =>
                setState((s) => ({ ...s, toA: e.target.value }))
              }
              disabled={pending}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1 text-xs text-muted-foreground">
            Період порівняння (B)
          </Label>
          <div className="flex gap-1">
            <Input
              type="date"
              value={state.fromB}
              onChange={(e) =>
                setState((s) => ({ ...s, fromB: e.target.value }))
              }
              disabled={pending}
            />
            <Input
              type="date"
              value={state.toB}
              onChange={(e) =>
                setState((s) => ({ ...s, toB: e.target.value }))
              }
              disabled={pending}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1 text-xs text-muted-foreground">
            Групування
          </Label>
          <Select
            value={state.groupBy}
            onValueChange={(value) =>
              setState((s) => ({
                ...s,
                groupBy: value as 'merchant' | 'category',
              }))
            }
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="merchant">За мерчантами</SelectItem>
              <SelectItem value="category">За категоріями</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button onClick={apply} disabled={pending} className="w-full">
            Порівняти
          </Button>
        </div>
      </div>
    </div>
  );
}
