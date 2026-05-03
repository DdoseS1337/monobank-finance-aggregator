'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, getCategoryLabel } from '@/lib/constants';
import type { Transaction } from '@/lib/types';

interface RecentTransactionsProps {
  transactions: Transaction[];
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  const recent = transactions.slice(0, 10);

  if (recent.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Останні транзакції</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-8">
          Немає транзакцій
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Останні транзакції</CardTitle>
        <Link
          href="/dashboard/transactions"
          className="text-sm text-primary hover:underline"
        >
          Переглянути всі
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recent.map((tx) => {
            const amount = parseFloat(tx.amount);
            const isIncome = amount > 0;
            return (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: tx.mccCategory
                        ? CATEGORY_COLORS[tx.mccCategory] || DEFAULT_CATEGORY_COLOR
                        : DEFAULT_CATEGORY_COLOR,
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {tx.merchantNameClean || tx.descriptionRaw}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(tx.transactionTime)}
                      </span>
                      {tx.mccCategory && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          {getCategoryLabel(tx.mccCategory)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <span
                    className={`text-sm font-semibold block tabular-nums ${
                      isIncome ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {isIncome ? '+' : ''}
                    {formatCurrency(amount, 'UAH')}
                  </span>
                  {tx.currency !== 'UAH' && (
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(parseFloat(tx.operationAmount), tx.currency)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
