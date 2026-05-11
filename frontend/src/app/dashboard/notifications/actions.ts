'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerToken, notificationsApi } from '@/lib/api';

export async function markOpenedAction(id: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await notificationsApi.open(token, id);
  revalidatePath('/dashboard/notifications');
}

export async function dismissAction(id: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await notificationsApi.dismiss(token, id);
  revalidatePath('/dashboard/notifications');
}
