'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface TokenContextValue {
  token: string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
  isReady: boolean;
}

const TokenContext = createContext<TokenContextValue | null>(null);

const STORAGE_KEY = 'monobank_token';

export function TokenProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setTokenState(stored);
    setIsReady(true);
  }, []);

  const setToken = (t: string) => {
    localStorage.setItem(STORAGE_KEY, t);
    setTokenState(t);
  };

  const clearToken = () => {
    localStorage.removeItem(STORAGE_KEY);
    setTokenState(null);
  };

  return (
    <TokenContext.Provider value={{ token, setToken, clearToken, isReady }}>
      {children}
    </TokenContext.Provider>
  );
}

export function useTokenContext() {
  const ctx = useContext(TokenContext);
  if (!ctx) throw new Error('useTokenContext must be used within TokenProvider');
  return ctx;
}
