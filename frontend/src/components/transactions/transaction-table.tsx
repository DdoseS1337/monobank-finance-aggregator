'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, getCategoryLabel } from '@/lib/constants';
import type { Transaction } from '@/lib/types';

interface TransactionTableProps {
  transactions: Transaction[];
}

const typeBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  DEBIT: { label: 'Витрата', variant: 'destructive' },
  CREDIT: { label: 'Дохід', variant: 'default' },
  TRANSFER: { label: 'Переказ', variant: 'secondary' },
  HOLD: { label: 'Холд', variant: 'outline' },
};

export function TransactionTable({ transactions }: TransactionTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Немає транзакцій за обраний період
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Дата</TableHead>
            <TableHead>Опис</TableHead>
            <TableHead>Категорія</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead className="text-right">Сума</TableHead>
            <TableHead className="text-right">Баланс</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => {
            const amount = parseFloat(tx.amount);
            const isIncome = amount > 0;
            const badge = typeBadge[tx.transactionType] || typeBadge.DEBIT;

            return (
              <TableRow key={tx.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDateTime(tx.transactionTime)}
                </TableCell>
                <TableCell>
                  <div className="max-w-[250px]">
                    <p className="text-sm font-medium truncate">
                      {tx.merchantNameClean || tx.descriptionRaw}
                    </p>
                    {tx.merchantNameClean && (
                      <p className="text-xs text-muted-foreground truncate">
                        {tx.descriptionRaw}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {tx.mccCategory ? (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor:
                            CATEGORY_COLORS[tx.mccCategory] || DEFAULT_CATEGORY_COLOR,
                        }}
                      />
                      <span className="text-sm">{getCategoryLabel(tx.mccCategory)}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={`font-semibold tabular-nums ${
                      isIncome ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {isIncome ? '+' : ''}
                    {formatCurrency(amount, 'UAH')}
                  </span>
                  {tx.currency !== 'UAH' && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(parseFloat(tx.operationAmount), tx.currency)}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {formatCurrency(tx.balance, 'UAH')}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
