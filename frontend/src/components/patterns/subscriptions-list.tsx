'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getCategoryLabel } from '@/lib/constants';
import type { Subscription } from '@/lib/types';

const FREQUENCY_LABELS: Record<Subscription['frequency'], string> = {
  weekly: 'Щотижня',
  biweekly: 'Раз на 2 тижні',
  monthly: 'Щомісяця',
  quarterly: 'Щоквартально',
  yearly: 'Щорічно',
};

interface Props {
  subscriptions: Subscription[];
}

export function SubscriptionsList({ subscriptions }: Props) {
  const active = subscriptions.filter((s) => s.isActive);
  const inactive = subscriptions.filter((s) => !s.isActive);
  const monthlyTotal = active.reduce((s, sub) => {
    const amt = parseFloat(sub.amount);
    const perMonth =
      sub.frequency === 'weekly' ? amt * 4.33 :
      sub.frequency === 'biweekly' ? amt * 2.17 :
      sub.frequency === 'monthly' ? amt :
      sub.frequency === 'quarterly' ? amt / 3 :
      amt / 12;
    return s + perMonth;
  }, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Підписки</span>
          <span className="text-sm font-normal text-muted-foreground">
            {active.length} активних · ~{formatCurrency(monthlyTotal)} / міс
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {subscriptions.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            Підписок не виявлено. Потрібно щонайменше 3 регулярні платежі з стабільною сумою.
          </p>
        ) : (
          <div className="space-y-3">
            {active.map((sub) => (
              <SubscriptionRow key={sub.merchant} sub={sub} />
            ))}
            {inactive.length > 0 && (
              <>
                <div className="pt-4 pb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Неактивні ({inactive.length})
                </div>
                {inactive.map((sub) => (
                  <SubscriptionRow key={sub.merchant} sub={sub} dim />
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SubscriptionRow({ sub, dim = false }: { sub: Subscription; dim?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg border border-border p-3 ${dim ? 'opacity-60' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{sub.merchant}</p>
          {sub.isActive ? (
            <Badge variant="outline" className="text-green-400 border-green-400/30">
              Активна
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Призупинена
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {sub.category ? getCategoryLabel(sub.category) : 'Без категорії'} ·{' '}
          {FREQUENCY_LABELS[sub.frequency]} · {sub.transactionCount} транзакцій
        </p>
        {sub.nextExpectedDate && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Наступний платіж очікується ~{formatDate(sub.nextExpectedDate)}
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-semibold tabular-nums">{formatCurrency(sub.amount)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          всього {formatCurrency(sub.totalSpent)}
        </p>
      </div>
    </div>
  );
}
