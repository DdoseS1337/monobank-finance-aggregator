'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { getCategoryLabel, CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from '@/lib/constants';
import type { TopCategoryItem, TopMerchantItem } from '@/lib/types';

// ── Top Categories ───────────────────────────────────────────────────────────

interface TopCategoriesProps {
  data: TopCategoryItem[];
}

export function TopCategoriesTable({ data }: TopCategoriesProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Топ категорії</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">Немає даних</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Топ категорії</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((item) => {
            const color = CATEGORY_COLORS[item.category] ?? DEFAULT_CATEGORY_COLOR;
            const pct = parseFloat(item.percent);
            return (
              <div key={item.category} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate font-medium">{getCategoryLabel(item.category)}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <span className="text-muted-foreground text-xs tabular-nums">{item.count} тр.</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(item.total)}</span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Top Merchants ────────────────────────────────────────────────────────────

interface TopMerchantsProps {
  data: TopMerchantItem[];
}

export function TopMerchantsTable({ data }: TopMerchantsProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Топ мерчанти</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">Немає даних</CardContent>
      </Card>
    );
  }

  const maxTotal = Math.max(...data.map((d) => parseFloat(d.total)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Топ мерчанти</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((item, i) => {
            const pct = maxTotal > 0 ? (parseFloat(item.total) / maxTotal) * 100 : 0;
            return (
              <div key={item.merchant} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground w-4 flex-shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="truncate font-medium capitalize">{item.merchant}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <span className="text-muted-foreground text-xs tabular-nums">{item.count} тр.</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(item.total)}</span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
