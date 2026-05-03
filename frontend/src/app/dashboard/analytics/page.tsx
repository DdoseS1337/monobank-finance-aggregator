'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAnalyticsData } from '@/hooks/use-analytics-data';
import { AnalyticsSummaryCards } from '@/components/analytics/analytics-summary-cards';
import { MonthlyTrendChart } from '@/components/analytics/monthly-trend-chart';
import { SpendingTrendChart } from '@/components/analytics/spending-trend-chart';
import { CategoryChart } from '@/components/analytics/category-chart';
import { DayOfWeekChart } from '@/components/analytics/day-of-week-chart';
import { TopCategoriesTable, TopMerchantsTable } from '@/components/analytics/top-tables';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

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
const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const appliedFrom = searchParams.get('from') ?? threeMonthsAgo;
  const appliedTo = searchParams.get('to') ?? today;

  const [draftFrom, setDraftFrom] = useState(appliedFrom);
  const [draftTo, setDraftTo] = useState(appliedTo);
  const [dateError, setDateError] = useState<string | null>(null);

  useEffect(() => {
    setDraftFrom(appliedFrom);
    setDraftTo(appliedTo);
  }, [appliedFrom, appliedTo]);

  const isDirty = draftFrom !== appliedFrom || draftTo !== appliedTo;

  const handleSearch = () => {
    const err = isValidDateRange(draftFrom, draftTo);
    if (err) { setDateError(err); return; }
    setDateError(null);
    const params = new URLSearchParams();
    params.set('from', draftFrom);
    params.set('to', draftTo);
    router.push(`/dashboard/analytics?${params.toString()}`);
  };

  const { data, loading, error } = useAnalyticsData(appliedFrom, appliedTo);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Аналітика</h1>
          <p className="text-muted-foreground mt-1">Детальний аналіз ваших фінансів</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="an-from" className="text-xs">Від</Label>
            <Input
              id="an-from"
              type="date"
              value={draftFrom}
              max={today}
              onChange={(e) => { setDraftFrom(e.target.value); setDateError(null); }}
              className="h-9 w-36"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="an-to" className="text-xs">До</Label>
            <Input
              id="an-to"
              type="date"
              value={draftTo}
              max={today}
              onChange={(e) => { setDraftTo(e.target.value); setDateError(null); }}
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
            Застосувати
          </Button>
        </div>
      </div>

      {/* Date error */}
      {dateError && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2 text-yellow-400 text-sm">
          {dateError}
        </div>
      )}

      {/* API error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && data && (
        <div className="space-y-6">
          {/* KPI cards — always shows this month data */}
          <AnalyticsSummaryCards summary={data.summary} />

          {/* Monthly income vs expenses */}
          <MonthlyTrendChart data={data.monthly} />

          {/* Daily spending trend with moving average */}
          <SpendingTrendChart data={data.trend} />

          {/* Category breakdown + Day of week */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CategoryChart data={data.categories} />
            <DayOfWeekChart data={data.dayOfWeek} />
          </div>

          {/* Top categories + Top merchants */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopCategoriesTable data={data.topCategories} />
            <TopMerchantsTable data={data.topMerchants} />
          </div>
        </div>
      )}

      {!loading && !data && !error && (
        <div className="text-center py-20 text-muted-foreground">Немає даних за обраний період</div>
      )}
    </div>
  );
}
