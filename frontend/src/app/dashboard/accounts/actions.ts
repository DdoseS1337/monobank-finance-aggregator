'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { accountsApi, getServerToken, transactionsApi } from '@/lib/api';

export async function linkMonobankAction(token: string) {
  const auth = await getServerToken();
  if (!auth) redirect('/login');
  const result = await accountsApi.linkMonobank(auth, token);
  revalidatePath('/dashboard/accounts');
  revalidatePath('/dashboard');
  return result;
}

export async function unlinkAction(accountId: string) {
  const auth = await getServerToken();
  if (!auth) redirect('/login');
  await accountsApi.unlink(auth, accountId);
  revalidatePath('/dashboard/accounts');
  revalidatePath('/dashboard');
}

export async function backfillAction(accountId: string, days = 31) {
  const auth = await getServerToken();
  if (!auth) redirect('/login');
  await transactionsApi.importBackfill(auth, accountId, days);
  revalidatePath('/dashboard/transactions');
  revalidatePath('/dashboard');
}
