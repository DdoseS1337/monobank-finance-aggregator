import { redirect } from 'next/navigation';
import { CreditCard } from 'lucide-react';
import { getServerToken, transactionsApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { MoneyDisplay } from '@/components/shared/money-display';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ type?: string; cursor?: string; search?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = await getServerToken();
  if (!token) redirect('/login');

  const page = await transactionsApi
    .list(token, {
      type: params.type as 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'HOLD' | undefined,
      search: params.search,
      cursor: params.cursor,
      limit: 50,
    })
    .catch(() => ({ items: [], nextCursor: null }));

  if (page.items.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Транзакції"
          description="Імпорт з Monobank через /accounts. Категоризація — MCC + merchant rules."
        />
        <EmptyState
          icon={CreditCard}
          title="Транзакцій ще немає"
          description="Підключіть Monobank та запустіть backfill, щоб побачити список тут."
          actionHref="/dashboard/accounts"
          actionLabel="До рахунків"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Транзакції" description={`Показано ${page.items.length} останніх записів.`} />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Дата</th>
              <th className="px-4 py-2 text-left">Опис</th>
              <th className="px-4 py-2 text-left">Тип</th>
              <th className="px-4 py-2 text-right">Сума</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {new Date(t.transactionDate).toLocaleString('uk-UA', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="px-4 py-2">
                  <p className="font-medium">
                    {t.merchantName ?? t.description ?? 'Транзакція'}
                  </p>
                  {t.description && t.merchantName && (
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">
                  <span className="rounded-md bg-muted/40 px-1.5 py-0.5">{t.type}</span>
                  {t.status === 'PENDING' && (
                    <span className="ml-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                      Hold
                    </span>
                  )}
                </td>
                <td
                  className={cn(
                    'whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums',
                    t.type === 'CREDIT' ? 'text-emerald-600' : 'text-foreground',
                  )}
                >
                  <MoneyDisplay
                    amount={Number(t.amount) * (t.type === 'CREDIT' ? 1 : -1)}
                    currency={t.currency}
                    signed
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
