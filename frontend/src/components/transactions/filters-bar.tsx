'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { getCategoryLabel } from '@/lib/constants';

interface FiltersBarProps {
  from: string;
  to: string;
  category: string;
  type: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  categories: string[];
  onSearch: () => void;
  isDirty: boolean;
}

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Всі типи' },
  { value: 'DEBIT', label: 'Витрати' },
  { value: 'CREDIT', label: 'Доходи' },
  { value: 'TRANSFER', label: 'Перекази' },
];

export function FiltersBar({
  from,
  to,
  category,
  type,
  onFromChange,
  onToChange,
  onCategoryChange,
  onTypeChange,
  categories,
  onSearch,
  isDirty,
}: FiltersBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="filter-from" className="text-xs">Від</Label>
        <Input
          id="filter-from"
          type="date"
          value={from}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-9 w-36"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="filter-to" className="text-xs">До</Label>
        <Input
          id="filter-to"
          type="date"
          value={to}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onToChange(e.target.value)}
          className="h-9 w-36"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="filter-type" className="text-xs">Тип</Label>
        <select
          id="filter-type"
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
          className="flex h-9 w-36 rounded-md border border-input bg-black px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filter-category" className="text-xs">Категорія</Label>
        <select
          id="filter-category"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="flex h-9 w-44 rounded-md border border-input bg-black px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Всі категорії</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {getCategoryLabel(c)}
            </option>
          ))}
        </select>
      </div>
      <Button
        size="sm"
        className="h-9"
        onClick={onSearch}
        disabled={!isDirty}
      >
        <svg aria-hidden="true" className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Пошук
      </Button>
      {category && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCategoryChange('')}
          className="h-9"
        >
          Скинути категорію
        </Button>
      )}
    </div>
  );
}
