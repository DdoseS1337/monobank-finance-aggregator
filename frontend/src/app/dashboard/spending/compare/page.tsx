import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GitCompare } from 'lucide-react';
import { getServerToken, transactionsApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { MoneyDisplay } from '@/components/shared/money-display';
import { CompareForm } from './compare-form';
import { DecompositionView } from './decomposition-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    fromA?: string;
    toA?: string;
    fromB?: string;
    toB?: string;
    groupBy?: string;
  }>;
}

function defaultMonth(offset: number): { from: Date; to: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0, 23, 59, 59);
  return { from, to };
}

function parseISODate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

export default async function SpendingComparePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = await getServerToken();
  if (!token) redirect('/login');

  const prev = defaultMonth(-1);
  const cur = defaultMonth(0);
  const fromA = parseISODate(params.fromA, prev.from);
  const toA = parseISODate(params.toA, prev.to);
  const fromB = parseISODate(params.fromB, cur.from);
  const toB = parseISODate(params.toB, cur.to);
  const groupBy: 'merchant' | 'category' =
    params.groupBy === 'category' ? 'category' : 'merchant';

  const report = await transactionsApi
    .spendingDecomposition(token, {
      fromA: fromA.toISOString(),
      toA: toA.toISOString(),
      fromB: fromB.toISOString(),
      toB: toB.toISOString(),
      groupBy,
    })
    .catch(() => null);

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/spending"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        До витрат
      </Link>

      <PageHeader
        title="Порівняння періодів"
        description="Причинна декомпозиція зміни витрат: PRICE (середній чек), VOLUME (кількість покупок), MIX (нові/зниклі мерчанти)."
      />

      <CompareForm
        initial={{
          fromA: fromA.toISOString().slice(0, 10),
          toA: toA.toISOString().slice(0, 10),
          fromB: fromB.toISOString().slice(0, 10),
          toB: toB.toISOString().slice(0, 10),
          groupBy,
        }}
      />

      {!report ? (
        <EmptyState
          icon={GitCompare}
          title="Немає даних для порівняння"
          description="Спробуйте інший діапазон або додайте більше імпортованих транзакцій."
        />
      ) : (
        <DecompositionView report={report} />
      )}
    </div>
  );
}
