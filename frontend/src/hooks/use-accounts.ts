'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAccounts } from '@/lib/api';
import type { BankAccount } from '@/lib/types';

export function useAccounts(token: string | null) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAccounts(token);
      setAccounts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return { accounts, loading, error, refetch: load };
}
