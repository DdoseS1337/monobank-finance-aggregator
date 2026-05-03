'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccounts } from '@/hooks/use-accounts';
import { getCurrencyName, getCurrencySymbol, cn } from '@/lib/utils';
import type { BankAccount } from '@/lib/types';

interface AccountSelectorProps {
  token: string;
  selected: string | null;
  onSelect: (account: BankAccount) => void;
}

export function AccountSelector({ token, selected, onSelect }: AccountSelectorProps) {
  const { accounts, loading, error } = useAccounts(token);

  if (loading) {
    return (
      <div className="space-y-3 w-full max-w-md mx-auto">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-md mx-auto border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive text-center">
            Невірний токен або помилка зв&apos;язку. Перевірте токен та спробуйте знову.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 w-full max-w-md mx-auto">
      <h3 className="text-lg font-semibold text-center">Оберіть рахунок</h3>
      {accounts.map((acc) => (
        <Card
          key={acc.id}
          role="button"
          tabIndex={0}
          aria-pressed={selected === acc.id}
          className={cn(
            'cursor-pointer transition-all hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected === acc.id && 'border-primary ring-2 ring-primary/20',
          )}
          onClick={() => onSelect(acc)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(acc);
            }
          }}
        >
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium">{getCurrencyName(acc.currencyCode)} рахунок</p>
              <p className="text-sm text-muted-foreground capitalize">{acc.type}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold">
                {getCurrencySymbol(acc.currencyCode)}{' '}
                {(acc.balance / 100).toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
