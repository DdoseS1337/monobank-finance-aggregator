'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToken } from '@/hooks/use-token';
import { TokenForm } from '@/components/setup/token-form';
import { AccountSelector } from '@/components/setup/account-selector';
import { SyncControls } from '@/components/setup/sync-controls';
import { Button } from '@/components/ui/button';
import type { BankAccount } from '@/lib/types';

type Step = 'token' | 'account' | 'sync' | 'done';

export default function SetupPage() {
  const router = useRouter();
  const { token, setToken } = useToken();
  const [step, setStep] = useState<Step>(token ? 'account' : 'token');
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);

  const steps = [
    { key: 'token', label: '1. Токен' },
    { key: 'account', label: '2. Рахунок' },
    { key: 'sync', label: '3. Синхронізація' },
  ];

  const currentIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Налаштування</h1>
          <p className="text-muted-foreground">
            Підключіть ваш Monobank для аналізу витрат
          </p>
        </div>

        {/* Step indicators */}
        {step !== 'done' && (
          <div className="flex justify-center gap-2">
            {steps.map((s, i) => (
              <div
                key={s.key}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  i <= currentIndex
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {s.label}
              </div>
            ))}
          </div>
        )}

        {/* Step content */}
        {step === 'token' && (
          <TokenForm
            onSubmit={(t) => {
              setToken(t);
              setStep('account');
            }}
          />
        )}

        {step === 'account' && token && (
          <div className="space-y-4">
            <AccountSelector
              token={token}
              selected={selectedAccount?.id ?? null}
              onSelect={(acc) => setSelectedAccount(acc)}
            />
            {selectedAccount && (
              <div className="flex justify-center">
                <Button onClick={() => setStep('sync')}>
                  Далі
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'sync' && token && selectedAccount && (
          <SyncControls
            token={token}
            accountId={selectedAccount.id}
            onSuccess={(count) => {
              setSyncedCount(count);
              setStep('done');
            }}
          />
        )}

        {step === 'done' && (
          <div className="text-center space-y-4">
            <div className="rounded-full bg-green-500/10 w-20 h-20 flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold">Готово!</h2>
            <p className="text-muted-foreground">
              Синхронізовано {syncedCount} транзакцій
            </p>
            <Button onClick={() => router.push('/dashboard')} size="lg">
              Перейти до дашборду
            </Button>
          </div>
        )}

        {/* Back button */}
        {step !== 'token' && step !== 'done' && (
          <div className="flex justify-center">
            <button
              onClick={() => {
                if (step === 'account') setStep('token');
                if (step === 'sync') setStep('account');
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Назад
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
