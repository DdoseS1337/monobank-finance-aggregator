'use client';

import { useState } from 'react';
import { syncTransactions } from '@/lib/api';
import type { SyncRequest, SyncResponse } from '@/lib/types';

export function useSync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResponse | null>(null);

  const sync = async (request: SyncRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await syncTransactions(request);
      setResult(data);
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Помилка синхронізації';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return { sync, loading, error, result };
}
