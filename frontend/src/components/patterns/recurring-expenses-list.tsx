'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { getCategoryLabel } from '@/lib/constants';
import type { RecurringExpense } from '@/lib/types';

interface Props {
  expenses: RecurringExpense[];
}

export function RecurringExpensesList({ expenses }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Повторювані витрати</CardTitle>
        <p className="text-sm text-muted-foreground">
          Мерчанти з множинними транзакціями — regularity score показує стабільність інтервалів
        </p>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            Недостатньо даних.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left font-normal py-2">Мерчант</th>
                  <th className="text-left font-normal py-2 hidden sm:table-cell">
                    Категорія
                  </th>
                  <th className="text-right font-normal py-2">Разів</th>
                  <th className="text-right font-normal py-2 hidden md:table-cell">
                    Регулярність
                  </th>
                  <th className="text-right font-normal py-2">Усього</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(0, 20).map((e) => (
                  <tr
                    key={e.merchant}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-2.5 truncate max-w-[200px]">{e.merchant}</td>
                    <td className="py-2.5 text-muted-foreground hidden sm:table-cell">
                      {e.category ? getCategoryLabel(e.category) : '—'}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {e.occurrences}
                    </td>
                    <td className="py-2.5 text-right tabular-nums hidden md:table-cell">
                      <span
                        className={
                          e.regularityScore >= 0.7
                            ? 'text-green-400'
                            : e.regularityScore >= 0.4
                            ? 'text-yellow-400'
                            : 'text-muted-foreground'
                        }
                      >
                        {Math.round(e.regularityScore * 100)}%
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium">
                      {formatCurrency(e.totalSpent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
