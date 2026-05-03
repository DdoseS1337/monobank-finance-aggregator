'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAllInsights } from '@/lib/api';
import type { Insight, InsightsResponse } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { InsightCard } from '@/components/insights/insight-card';

type FilterKey = 'all' | Insight['type'];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Усі' },
  { key: 'anomaly', label: 'Аномалії' },
  { key: 'category_spike', label: 'Зростання' },
  { key: 'unusual_purchase', label: 'Нетипові' },
  { key: 'conclusion', label: 'Висновки' },
];

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await getAllInsights();
        if (!cancelled) setData(result);
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

  const filteredInsights = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.insights;
    return data.insights.filter((i) => i.type === filter);
  }, [data, filter]);

  const counts = useMemo(() => {
    const base: Record<FilterKey, number> = {
      all: 0,
      anomaly: 0,
      category_spike: 0,
      unusual_purchase: 0,
      conclusion: 0,
    };
    if (!data) return base;
    base.all = data.insights.length;
    for (const i of data.insights) base[i.type]++;
    return base;
  }, [data]);

  const severityCounts = useMemo(() => {
    const base = { critical: 0, warning: 0, info: 0 };
    if (!data) return base;
    for (const i of data.insights) base[i.severity]++;
    return base;
  }, [data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Інсайти</h1>
        <p className="text-muted-foreground mt-1">
          Автоматичні висновки, аномалії та підозрілі зміни у ваших витратах
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {!loading && data && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Критичні</p>
              <p className="text-3xl font-bold text-red-400 tabular-nums mt-1">
                {severityCounts.critical}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Попередження</p>
              <p className="text-3xl font-bold text-yellow-400 tabular-nums mt-1">
                {severityCounts.warning}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Інформаційні</p>
              <p className="text-3xl font-bold text-blue-400 tabular-nums mt-1">
                {severityCounts.info}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter tabs */}
      {!loading && data && (
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="ml-1.5 text-xs opacity-70">{counts[f.key]}</span>
            </Button>
          ))}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {!loading && filteredInsights.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          Інсайтів поки що немає. Спробуйте синхронізувати більше транзакцій.
        </div>
      )}

      <div className="space-y-3">
        {filteredInsights.map((insight, i) => (
          <InsightCard key={`${insight.type}-${insight.date}-${i}`} insight={insight} />
        ))}
      </div>

      {data && (
        <p className="text-xs text-muted-foreground text-center pt-4">
          Згенеровано {new Date(data.generatedAt).toLocaleString('uk-UA')} · Період{' '}
          {data.period.from} — {data.period.to}
        </p>
      )}
    </div>
  );
}
