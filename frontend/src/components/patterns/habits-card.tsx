'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { getCategoryLabel } from '@/lib/constants';
import type { FinancialHabits } from '@/lib/types';

interface Props {
  habits: FinancialHabits;
}

export function HabitsCard({ habits }: Props) {
  const savingsRate = parseFloat(habits.savingsRate);
  const savingsColor =
    savingsRate < 0 ? 'text-red-400' : savingsRate < 10 ? 'text-yellow-400' : 'text-green-400';

  const ratio = parseFloat(habits.weekendToWeekdayRatio);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Weekday / Weekend + Savings */}
      <Card>
        <CardHeader>
          <CardTitle>Ритм витрат</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatBox
              label="Будні (день)"
              value={formatCurrency(habits.weekdayAvgSpend)}
            />
            <StatBox
              label="Вихідні (день)"
              value={formatCurrency(habits.weekendAvgSpend)}
            />
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Відношення вихідні/будні</p>
            <p className="text-xl font-bold tabular-nums mt-1">
              {habits.weekendToWeekdayRatio}x
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {ratio > 1.3
                ? 'Ви витрачаєте помітно більше на вихідних'
                : ratio < 0.8
                ? 'Ви економніші у вихідні'
                : 'Рівномірні витрати протягом тижня'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatBox
              label="Середній дохід/міс"
              value={formatCurrency(habits.avgMonthlyIncome)}
            />
            <StatBox
              label="Середні витрати/міс"
              value={formatCurrency(habits.avgMonthlyExpense)}
            />
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Savings Rate</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${savingsColor}`}>
              {habits.savingsRate}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {savingsRate < 0
                ? 'Витрати перевищують дохід'
                : savingsRate < 10
                ? 'Низький рівень заощаджень'
                : savingsRate < 20
                ? 'Помірний рівень заощаджень'
                : 'Хороший рівень заощаджень'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Time of day + Active days + Large purchases */}
      <Card>
        <CardHeader>
          <CardTitle>Розподіл у часі</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Витрати за часом доби</p>
            {habits.timeOfDay.map((t) => (
              <div key={t.slot} className="flex items-center gap-3">
                <div className="w-24 text-xs">
                  <p className="font-medium">{t.slotLabel}</p>
                  <p className="text-muted-foreground">{t.hourRange}</p>
                </div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${t.percent}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums w-12 text-right">
                  {parseFloat(t.percent).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <StatBox
              label="Найактивніший день"
              value={habits.mostActiveDay}
              small
            />
            <StatBox
              label="Транзакцій/день"
              value={habits.avgTransactionsPerDay}
              small
            />
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Великі покупки</p>
            <p className="text-sm mt-1">
              {habits.largeTransactionCount} транзакцій більше{' '}
              <span className="font-semibold">
                {formatCurrency(habits.largeTransactionThreshold)}
              </span>{' '}
              ({habits.largeTransactionPercent}% від усіх)
            </p>
          </div>

          {habits.topStableCategories.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Найстабільніші категорії
              </p>
              <div className="space-y-1">
                {habits.topStableCategories.slice(0, 5).map((c) => (
                  <div
                    key={c.category}
                    className="flex justify-between text-xs"
                  >
                    <span>
                      {getCategoryLabel(c.category)}{' '}
                      <span className="text-muted-foreground">
                        · {c.monthsPresent} міс
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatCurrency(c.avgMonthlySpend)}/міс
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-bold tabular-nums mt-1 ${small ? 'text-sm' : 'text-lg'}`}>
        {value}
      </p>
    </div>
  );
}
