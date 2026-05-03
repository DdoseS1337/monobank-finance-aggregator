'use client';

import { useMemo } from 'react';
import type { Transaction, CategorySummary, DailySummary } from '@/lib/types';

function isExpense(tx: Transaction, amount: number): boolean {
  // TRANSFER with negative amount is also an expense (e.g. monthly payments)
  // HOLD with negative amount is a pending expense
  // DEBIT is always an expense
  return amount < 0 && tx.transactionType !== 'TRANSFER';
}

function isIncome(tx: Transaction, amount: number): boolean {
  return amount > 0 && tx.transactionType !== 'TRANSFER';
}

export function useAnalytics(transactions: Transaction[]) {
  return useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let totalCashback = 0;
    let currentBalance = 0;
    let totalTransfers = 0;

    const categoryMap = new Map<string, { total: number; count: number }>();
    const dailyMap = new Map<string, { income: number; expense: number }>();

    const sorted = [...transactions].sort(
      (a, b) => new Date(b.transactionTime).getTime() - new Date(a.transactionTime).getTime(),
    );

    if (sorted.length > 0) {
      currentBalance = parseFloat(sorted[0].balance);
    }

    for (const tx of transactions) {
      const amount = parseFloat(tx.amount);
      const cashback = parseFloat(tx.cashbackAmount);
      totalCashback += cashback;

      if (isIncome(tx, amount)) {
        totalIncome += amount;
      } else if (isExpense(tx, amount)) {
        totalExpense += Math.abs(amount);
      } else if (tx.transactionType === 'TRANSFER') {
        totalTransfers += amount;
      }

      // Category breakdown (expenses only — negative non-transfer amounts)
      if (isExpense(tx, amount)) {
        const cat = tx.mccCategory || 'Other';
        const existing = categoryMap.get(cat) || { total: 0, count: 0 };
        existing.total += Math.abs(amount);
        existing.count += 1;
        categoryMap.set(cat, existing);
      }

      // Daily trend
      const day = tx.transactionTime.slice(0, 10);
      const dayData = dailyMap.get(day) || { income: 0, expense: 0 };
      if (isIncome(tx, amount)) {
        dayData.income += amount;
      } else if (isExpense(tx, amount)) {
        dayData.expense += Math.abs(amount);
      }
      dailyMap.set(day, dayData);
    }

    const categoryBreakdown: CategorySummary[] = Array.from(categoryMap.entries())
      .map(([category, { total, count }]) => ({
        category,
        total: Math.round(total * 100) / 100,
        count,
        percentage: totalExpense > 0 ? Math.round((total / totalExpense) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const dailyTrend: DailySummary[] = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        income: Math.round(data.income * 100) / 100,
        expense: Math.round(data.expense * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      totalCashback: Math.round(totalCashback * 100) / 100,
      currentBalance: Math.round(currentBalance * 100) / 100,
      totalTransfers: Math.round(totalTransfers * 100) / 100,
      categoryBreakdown,
      dailyTrend,
    };
  }, [transactions]);
}
