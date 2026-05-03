'use client';

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { getCategoryLabel } from '@/lib/constants';
import type { AnalyticsSummary } from '@/lib/types';

interface Props {
  summary: AnalyticsSummary;
}

export function AnalyticsSummaryCards({ summary }: Props) {
  const expenseDelta =
    parseFloat(summary.lastMonthExpense) > 0
      ? ((parseFloat(summary.thisMonthExpense) - parseFloat(summary.lastMonthExpense)) /
          parseFloat(summary.lastMonthExpense)) *
        100
      : null;

  const cards = [
    {
      label: 'Витрати цього місяця',
      value: formatCurrency(summary.thisMonthExpense),
      sub: expenseDelta !== null
        ? `${expenseDelta >= 0 ? '+' : ''}${expenseDelta.toFixed(1)}% vs мин. міс.`
        : 'vs мин. міс.',
      subColor: expenseDelta === null ? 'text-muted-foreground' : expenseDelta > 0 ? 'text-red-400' : 'text-green-400',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      icon: (
        <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
      ),
    },
    {
      label: 'Дохід цього місяця',
      value: formatCurrency(summary.thisMonthIncome),
      sub: null,
      subColor: 'text-muted-foreground',
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      icon: (
        <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      label: 'Сер. витрата на день',
      value: formatCurrency(summary.avgDailySpend),
      sub: 'поточний місяць',
      subColor: 'text-muted-foreground',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      icon: (
        <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: 'Топ-категорія',
      value: summary.topCategory ? getCategoryLabel(summary.topCategory) : '—',
      sub: 'найбільше витрат',
      subColor: 'text-muted-foreground',
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      icon: (
        <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground truncate">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 tabular-nums truncate ${card.color}`}>
                  {card.value}
                </p>
                {card.sub && (
                  <p className={`text-xs mt-1 ${card.subColor}`}>{card.sub}</p>
                )}
              </div>
              <div className={`p-3 rounded-full flex-shrink-0 ml-3 ${card.bg} ${card.color}`}>
                {card.icon}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
