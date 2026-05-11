'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { linkMonobankAction } from './actions';

export function LinkMonobankCard() {
  const [token, setToken] = useState('');
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setInfo(null);
    setError(null);
    if (!token.trim()) {
      setError('Вставте токен з api.monobank.ua');
      return;
    }
    startTransition(async () => {
      try {
        const result = await linkMonobankAction(token.trim());
        setInfo(`Підключено ${result.linked} рахун${result.linked === 1 ? 'ок' : 'ків'}.`);
        setToken('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не вдалося підключити');
      }
    });
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Підключити Monobank</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Особистий API-токен зберігається в зашифрованому вигляді на серверній стороні.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[260px] space-y-1">
          <Label htmlFor="mono-token" className="text-xs">
            Monobank token
          </Label>
          <Input
            id="mono-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="uXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            type="password"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Підключення…' : 'Підключити'}
        </Button>
      </div>
      {info && <p className="mt-2 text-sm text-emerald-600">{info}</p>}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </form>
  );
}
