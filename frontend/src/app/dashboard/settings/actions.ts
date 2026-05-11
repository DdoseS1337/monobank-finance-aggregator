'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerToken, personalizationApi, type UserProfileDto } from '@/lib/api';

export async function updateProfileAction(input: Partial<UserProfileDto>) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const profile = await personalizationApi.update(token, input);
  revalidatePath('/dashboard/settings');
  return profile;
}

export async function recomputeTraitsAction() {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const profile = await personalizationApi.recomputeTraits(token);
  revalidatePath('/dashboard/settings');
  return profile;
}
