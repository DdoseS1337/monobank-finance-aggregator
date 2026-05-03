'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSync } from '@/hooks/use-sync';

interface SyncControlsProps {
  token: string;
  accountId: string;
  onSuccess: (synced: number) => void;
}

export function SyncControls({ token, accountId, onSuccess }: SyncControlsProps) {
  const { sync, loading, error } = useSync();

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);

  const handleSync = async () => {
    try {
      const result = await sync({
        source: 'monobank',
        token,
        accountId,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      });
      onSuccess(result.synced);
    } catch {
      // error handled in hook
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Синхронізація транзакцій</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="from">Від</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">До</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="text-destructive text-sm">{error}</p>
        )}

        <Button
          className="w-full"
          onClick={handleSync}
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Синхронізація... Це може зайняти час
            </span>
          ) : (
            'Синхронізувати'
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Monobank дозволяє отримувати дані за останні 31 день за один запит.
          Більші періоди будуть розбиті автоматично.
        </p>
      </CardContent>
    </Card>
  );
}
