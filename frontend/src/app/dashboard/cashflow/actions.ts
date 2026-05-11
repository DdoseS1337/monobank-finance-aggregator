'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cashflowApi, getServerToken } from '@/lib/api';

export async function refreshCashflowAction(opts?: {
  horizonDays?: number;
  trials?: number;
}) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const result = await cashflowApi.refresh(token, opts);
  revalidatePath('/dashboard/cashflow');
  revalidatePath('/dashboard');
  return {
    deficitProbability: result.deficitProbability,
    trialsRun: result.trialsRun,
  };
}
