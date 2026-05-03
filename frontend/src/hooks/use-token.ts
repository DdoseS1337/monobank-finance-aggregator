'use client';

import { useTokenContext } from '@/providers/token-provider';

export function useToken() {
  const { token, setToken, clearToken, isReady } = useTokenContext();
  return { token, setToken, clearToken, hasToken: !!token, isReady };
}
