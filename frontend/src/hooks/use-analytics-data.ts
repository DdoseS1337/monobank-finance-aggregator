'use client';

import { useState, useEffect } from 'react';
import {
  getDayOfWeek,
  getMonthlyTrend,
  getSpendingByCategory,
  getSpendingTrend,
  getTopCategories,
  getTopMerchants,
  getAnalyticsSummary,
} from '@/lib/api';
import type {
  AnalyticsSummary,
  DayOfWeekItem,
  MonthlyTrendItem,
  SpendingByCategoryItem,
  SpendingTrendItem,
  TopCategoryItem,
  TopMerchantItem,
} from '@/lib/types';

export interface AnalyticsData {
  summary: AnalyticsSummary;
  monthly: MonthlyTrendItem[];
  trend: SpendingTrendItem[];
  categories: SpendingByCategoryItem[];
  dayOfWeek: DayOfWeekItem[];
  topCategories: TopCategoryItem[];
  topMerchants: TopMerchantItem[];
}

export function useAnalyticsData(from: string, to: string) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [summary, monthly, trend, categories, dayOfWeek, topCategories, topMerchants] =
          await Promise.all([
            getAnalyticsSummary(),
            getMonthlyTrend(from, to),
            getSpendingTrend(from, to),
            getSpendingByCategory(from, to),
            getDayOfWeek(from, to),
            getTopCategories(from, to, 8),
            getTopMerchants(from, to, 8),
          ]);

        if (!cancelled) {
          setData({ summary, monthly, trend, categories, dayOfWeek, topCategories, topMerchants });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Помилка завантаження аналітики');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return { data, loading, error };
}
