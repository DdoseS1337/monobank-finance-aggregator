'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransactions } from '@/hooks/use-transactions';
import { useAnalytics } from '@/hooks/use-analytics';
import { SummaryCards } from '@/components/dashboard/summary-cards';
import { SpendingChart } from '@/components/dashboard/spending-chart';
import { IncomeExpenseBar } from '@/components/dashboard/income-expense-bar';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { TopMerchants } from '@/components/dashboard/top-merchants';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function isValidDateRange(from: string, to: string): string | null {
  if (!from || !to) return 'Вкажіть обидві дати';
  const f = new Date(from);
  const t = new Date(to);
  if (isNaN(f.getTime())) return 'Невірна дата "Від"';
  if (isNaN(t.getTime())) return 'Невірна дата "До"';
  if (f > t) return '"Від" не може бути пізніше "До"';
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  if (t > now) return '"До" не може бути в майбутньому';
  return null;
}

const today = new Date().toISOString().slice(0, 10);
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const appliedFrom = searchParams.get('from') ?? thirtyDaysAgo;
  const appliedTo = searchParams.get('to') ?? today;

  const [draftFrom, setDraftFrom] = useState(appliedFrom);
  const [draftTo, setDraftTo] = useState(appliedTo);
  const [dateError, setDateError] = useState<string | null>(null);

  // Keep drafts in sync when URL changes externally (e.g. back/forward)
  useEffect(() => {
    setDraftFrom(appliedFrom);
    setDraftTo(appliedTo);
  }, [appliedFrom, appliedTo]);

  const isDirty = draftFrom !== appliedFrom || draftTo !== appliedTo;

  const handleSearch = () => {
    const err = isValidDateRange(draftFrom, draftTo);
    if (err) {
      setDateError(err);
      return;
    }
    setDateError(null);
    const params = new URLSearchParams();
    params.set('from', draftFrom);
    params.set('to', draftTo);
    router.push(`/dashboard?${params.toString()}`);
  };

  const { transactions, loading, error } = useTransactions({
    from: new Date(appliedFrom).toISOString(),
    to: new Date(appliedTo).toISOString(),
    take: 2000,
  });

  const analytics = useAnalytics(transactions);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Дашборд</h1>
          <p className="text-muted-foreground mt-1">
            Огляд ваших фінансів
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="dash-from" className="text-xs">Від</Label>
            <Input
              id="dash-from"
              type="date"
              value={draftFrom}
              max={today}
              onChange={(e) => {
                setDraftFrom(e.target.value);
                setDateError(null);
              }}
              className="h-9 w-36"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dash-to" className="text-xs">До</Label>
            <Input
              id="dash-to"
              type="date"
              value={draftTo}
              max={today}
              onChange={(e) => {
                setDraftTo(e.target.value);
                setDateError(null);
              }}
              className="h-9 w-36"
            />
          </div>
          <Button
            size="sm"
            className="h-9"
            onClick={handleSearch}
            disabled={!isDirty && !dateError}
          >
            <svg aria-hidden="true" className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Пошук
          </Button>
        </div>
      </div>

      {/* Date validation error */}
      {dateError && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2 text-yellow-400 text-sm">
          {dateError}
        </div>
      )}

      {/* API Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      )}

      {/* Empty */}
      {!loading && transactions.length === 0 && !error && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <svg aria-hidden="true" className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Немає транзакцій</h2>
          <p className="text-muted-foreground mb-4">
            Синхронізуйте ваші транзакції з Monobank
          </p>
          <Link
            href="/setup"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Синхронізувати
          </Link>
        </div>
      )}

      {!loading && transactions.length > 0 && (
        <>
          <SummaryCards
            totalExpense={analytics.totalExpense}
            totalIncome={analytics.totalIncome}
            totalCashback={analytics.totalCashback}
            currentBalance={analytics.currentBalance}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SpendingChart
              data={analytics.categoryBreakdown}
              totalExpense={analytics.totalExpense}
            />
            <TopMerchants transactions={transactions} />
          </div>

          <IncomeExpenseBar data={analytics.dailyTrend} />

          <RecentTransactions transactions={transactions} />
        </>
      )}
    </div>
  );
}
