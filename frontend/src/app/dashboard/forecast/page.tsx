'use client';

import { useEffect, useState } from 'react';
import {
  getBurnRate,
  getCashFlowForecast,
  getCategoryForecasts,
  getEndOfMonthProjection,
  getModelComparison,
} from '@/lib/api';
import type {
  BurnRate,
  CashFlowForecast,
  CategoryForecast,
  EndOfMonthProjection,
  ForecastModel,
  ModelComparisonItem,
} from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { CashFlowChart } from '@/components/forecasting/cash-flow-chart';
import { EndOfMonthCard } from '@/components/forecasting/end-of-month-card';
import { BurnRateCard } from '@/components/forecasting/burn-rate-card';
import { CategoryForecastsTable } from '@/components/forecasting/category-forecasts-table';
import { ModelComparisonCard } from '@/components/forecasting/model-comparison-card';

const MODELS: { value: ForecastModel; label: string }[] = [
  { value: 'ensemble', label: 'Ансамбль' },
  { value: 'exponential_smoothing', label: 'Holt (trend)' },
  { value: 'linear_trend', label: 'Лінійний тренд' },
  { value: 'seasonal_naive', label: 'Сезонний' },
  { value: 'moving_average', label: 'Ковзке середнє' },
];

const HORIZONS: { value: number; label: string }[] = [
  { value: 14, label: '14 днів' },
  { value: 30, label: '30 днів' },
  { value: 60, label: '60 днів' },
  { value: 90, label: '90 днів' },
];

interface ForecastData {
  cashFlow: CashFlowForecast;
  endOfMonth: EndOfMonthProjection;
  categoryForecasts: CategoryForecast[];
  burnRate: BurnRate;
  modelComparison: ModelComparisonItem[];
}

export default function ForecastPage() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [model, setModel] = useState<ForecastModel>('ensemble');
  const [horizon, setHorizon] = useState<number>(30);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [cashFlow, endOfMonth, categoryForecasts, burnRate, modelComparison] =
          await Promise.all([
            getCashFlowForecast({ model, horizonDays: horizon }),
            getEndOfMonthProjection(),
            getCategoryForecasts(),
            getBurnRate(),
            getModelComparison({ horizonDays: horizon }),
          ]);

        if (!cancelled) {
          setData({
            cashFlow,
            endOfMonth,
            categoryForecasts,
            burnRate,
            modelComparison,
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
  }, [model, horizon]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Прогноз</h1>
          <p className="text-muted-foreground mt-1">
            Прогнозування балансу, витрат до кінця місяця та burn rate
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Модель
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ForecastModel)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Горизонт
            </label>
            <select
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {HORIZONS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-6">
          <Skeleton className="h-96" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-80" />
        </div>
      )}

      {!loading && data && (
        <div className="space-y-6">
          <CashFlowChart data={data.cashFlow} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EndOfMonthCard data={data.endOfMonth} />
            <BurnRateCard data={data.burnRate} />
          </div>

          <ModelComparisonCard models={data.modelComparison} />
          <CategoryForecastsTable forecasts={data.categoryForecasts} />
        </div>
      )}
    </div>
  );
}
