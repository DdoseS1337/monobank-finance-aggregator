'use client';

import { useEffect, useState } from 'react';
import {
  getFinancialHabits,
  getMonthPeriodBehavior,
  getRecurringExpenses,
  getRegularPayments,
  getSubscriptions,
} from '@/lib/api';
import type {
  FinancialHabits,
  MonthPeriodBehavior,
  RecurringExpense,
  RegularPayment,
  Subscription,
} from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { SubscriptionsList } from '@/components/patterns/subscriptions-list';
import { RegularPaymentsList } from '@/components/patterns/regular-payments-list';
import { RecurringExpensesList } from '@/components/patterns/recurring-expenses-list';
import { MonthPeriodCard } from '@/components/patterns/month-period-card';
import { HabitsCard } from '@/components/patterns/habits-card';

interface PatternsData {
  subscriptions: Subscription[];
  regularPayments: RegularPayment[];
  recurringExpenses: RecurringExpense[];
  monthPeriod: MonthPeriodBehavior[];
  habits: FinancialHabits;
}

export default function PatternsPage() {
  const [data, setData] = useState<PatternsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [subscriptions, regularPayments, recurringExpenses, monthPeriod, habits] =
          await Promise.all([
            getSubscriptions(),
            getRegularPayments(),
            getRecurringExpenses(),
            getMonthPeriodBehavior(),
            getFinancialHabits(),
          ]);

        if (!cancelled) {
          setData({
            subscriptions,
            regularPayments,
            recurringExpenses,
            monthPeriod,
            habits,
          });
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Помилка завантаження');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Фінансові патерни</h1>
        <p className="text-muted-foreground mt-1">
          Підписки, регулярні платежі та ваші фінансові звички
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      )}

      {!loading && data && (
        <div className="space-y-6">
          <SubscriptionsList subscriptions={data.subscriptions} />
          <MonthPeriodCard data={data.monthPeriod} />
          <HabitsCard habits={data.habits} />
          <RegularPaymentsList payments={data.regularPayments} />
          <RecurringExpensesList expenses={data.recurringExpenses} />
        </div>
      )}
    </div>
  );
}
