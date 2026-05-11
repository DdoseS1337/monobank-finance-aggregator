'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { budgetsApi, getServerToken } from '@/lib/api';

interface CreateBudgetInput {
  name: string;
  method: 'CATEGORY' | 'ENVELOPE' | 'ZERO_BASED' | 'PAY_YOURSELF_FIRST';
  cadence: 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  baseCurrency: 'UAH' | 'USD' | 'EUR' | 'GBP' | 'PLN';
  startNow?: boolean;
  initialLines?: Array<{
    categoryId?: string | null;
    plannedAmount: string;
    thresholdPct?: number;
  }>;
}

export async function createBudgetAction(input: CreateBudgetInput) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const budget = await budgetsApi.create(token, input);
  revalidatePath('/dashboard/budgets');
  revalidatePath('/dashboard');
  return { id: budget.id };
}

export async function archiveBudgetAction(id: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await budgetsApi.archive(token, id);
  revalidatePath('/dashboard/budgets');
  revalidatePath(`/dashboard/budgets/${id}`);
  revalidatePath('/dashboard');
}

interface AdjustLineInput {
  budgetId: string;
  lineId: string;
  newPlannedAmount: string;
}

export async function adjustBudgetLineAction(input: AdjustLineInput) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await budgetsApi.adjustLine(token, input.budgetId, input.lineId, {
    newPlannedAmount: input.newPlannedAmount,
  });
  revalidatePath(`/dashboard/budgets/${input.budgetId}`);
  revalidatePath('/dashboard/budgets');
  revalidatePath('/dashboard');
}

export async function removeBudgetLineAction(input: {
  budgetId: string;
  lineId: string;
}) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await budgetsApi.removeLine(token, input.budgetId, input.lineId);
  revalidatePath(`/dashboard/budgets/${input.budgetId}`);
  revalidatePath('/dashboard/budgets');
  revalidatePath('/dashboard');
}

interface AddLineInput {
  budgetId: string;
  categoryId: string | null;
  plannedAmount: string;
  thresholdPct?: number;
}

export async function addBudgetLineAction(input: AddLineInput) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await budgetsApi.addLine(token, input.budgetId, {
    categoryId: input.categoryId,
    plannedAmount: input.plannedAmount,
    thresholdPct: input.thresholdPct,
  });
  revalidatePath(`/dashboard/budgets/${input.budgetId}`);
}
