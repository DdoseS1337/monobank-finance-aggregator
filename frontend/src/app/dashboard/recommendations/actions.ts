'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerToken, recommendationsApi } from '@/lib/api';

const tags = () => {
  revalidatePath('/dashboard/recommendations');
  revalidatePath('/dashboard');
};

export async function acceptRecommendationAction(id: string, feedbackText?: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await recommendationsApi.accept(token, id, feedbackText);
  tags();
}

export async function rejectRecommendationAction(id: string, feedbackText?: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await recommendationsApi.reject(token, id, feedbackText);
  tags();
}

export async function snoozeRecommendationAction(id: string, hours = 24) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await recommendationsApi.snooze(token, id, hours);
  tags();
}

export async function refreshRecommendationsAction() {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const result = await recommendationsApi.refresh(token);
  tags();
  return result;
}
