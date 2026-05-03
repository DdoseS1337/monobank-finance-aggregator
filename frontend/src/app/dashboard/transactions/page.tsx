'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransactions } from '@/hooks/use-transactions';
import { FiltersBar } from '@/components/transactions/filters-bar';
import { TransactionTable } from '@/components/transactions/transaction-table';
import { Pagination } from '@/components/transactions/pagination';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_SIZE = 50;

const today = new Date().toISOString().slice(0, 10);
const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

function isValidDate(d: string): boolean {
  return d !== '' && !isNaN(new Date(d).getTime());
}

export default function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const appliedFrom = searchParams.get('from') ?? ninetyDaysAgo;
  const appliedTo = searchParams.get('to') ?? today;
  const appliedCategory = searchParams.get('category') ?? '';
  const appliedType = searchParams.get('type') ?? '';
  const appliedPage = parseInt(searchParams.get('page') ?? '1', 10);
  const skip = (appliedPage - 1) * PAGE_SIZE;

  // Draft filters (user is editing before submitting)
  const [draftFrom, setDraftFrom] = useState(appliedFrom);
  const [draftTo, setDraftTo] = useState(appliedTo);
  const [draftCategory, setDraftCategory] = useState(appliedCategory);
  const [draftType, setDraftType] = useState(appliedType);
  const [dateError, setDateError] = useState<string | null>(null);

  // Keep drafts in sync when URL changes externally (back/forward)
  useEffect(() => {
    setDraftFrom(appliedFrom);
    setDraftTo(appliedTo);
    setDraftCategory(appliedCategory);
    setDraftType(appliedType);
  }, [appliedFrom, appliedTo, appliedCategory, appliedType]);

  const isDirty =
    draftFrom !== appliedFrom ||
    draftTo !== appliedTo ||
    draftCategory !== appliedCategory ||
    draftType !== appliedType;

  const buildParams = (overrides: Record<string, string>) => {
    const p = new URLSearchParams();
    p.set('from', appliedFrom);
    p.set('to', appliedTo);
    if (appliedCategory) p.set('category', appliedCategory);
    if (appliedType) p.set('type', appliedType);
    p.set('page', String(appliedPage));
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k);
    });
    return p.toString();
  };

  const handleSearch = () => {
    if (!isValidDate(draftFrom) || !isValidDate(draftTo)) {
      setDateError('Вкажіть коректні дати');
      return;
    }
    if (new Date(draftFrom) > new Date(draftTo)) {
      setDateError('"Від" не може бути пізніше "До"');
      return;
    }
    setDateError(null);
    const p = new URLSearchParams();
    p.set('from', draftFrom);
    p.set('to', draftTo);
    if (draftCategory) p.set('category', draftCategory);
    if (draftType) p.set('type', draftType);
    p.set('page', '1');
    router.push(`/dashboard/transactions?${p.toString()}`);
  };

  const { transactions, loading, error } = useTransactions({
    from: new Date(appliedFrom).toISOString(),
    to: new Date(appliedTo).toISOString(),
    category: appliedCategory || undefined,
    type: appliedType || undefined,
    skip,
    take: PAGE_SIZE,
  });

  // For category dropdown options
  const { transactions: allForCategories } = useTransactions({
    from: new Date(appliedFrom).toISOString(),
    to: new Date(appliedTo).toISOString(),
    take: 2000,
  });

  const categories = useMemo(() => {
    const cats = new Set<string>();
    allForCategories.forEach((tx) => {
      if (tx.mccCategory) cats.add(tx.mccCategory);
    });
    return Array.from(cats).sort();
  }, [allForCategories]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Транзакції</h1>
        <p className="text-muted-foreground mt-1">
          Повний список ваших транзакцій
        </p>
      </div>

      <FiltersBar
        from={draftFrom}
        to={draftTo}
        category={draftCategory}
        type={draftType}
        onFromChange={(v) => { setDraftFrom(v); setDateError(null); }}
        onToChange={(v) => { setDraftTo(v); setDateError(null); }}
        onCategoryChange={(v) => {
          setDraftCategory(v);
          // Apply category filter immediately without requiring Search click
          const p = new URLSearchParams();
          p.set('from', appliedFrom);
          p.set('to', appliedTo);
          if (v) p.set('category', v);
          if (appliedType) p.set('type', appliedType);
          p.set('page', '1');
          router.push(`/dashboard/transactions?${p.toString()}`);
        }}
        onTypeChange={(v) => {
          setDraftType(v);
          // Apply type filter immediately (same UX as category)
          const p = new URLSearchParams();
          p.set('from', appliedFrom);
          p.set('to', appliedTo);
          if (appliedCategory) p.set('category', appliedCategory);
          if (v) p.set('type', v);
          p.set('page', '1');
          router.push(`/dashboard/transactions?${p.toString()}`);
        }}
        categories={categories}
        onSearch={handleSearch}
        isDirty={isDirty}
      />

      {dateError && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2 text-yellow-400 text-sm">
          {dateError}
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <>
          <TransactionTable transactions={transactions} />
          <Pagination
            skip={skip}
            take={PAGE_SIZE}
            hasMore={transactions.length === PAGE_SIZE}
            onPrev={() => router.push(`/dashboard/transactions?${buildParams({ page: String(appliedPage - 1) })}`)}
            onNext={() => router.push(`/dashboard/transactions?${buildParams({ page: String(appliedPage + 1) })}`)}
          />
        </>
      )}
    </div>
  );
}
