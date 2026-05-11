'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerToken, rulesApi } from '@/lib/api';

export async function createRuleFromTemplateAction(input: {
  templateId: string;
  values: Record<string, unknown>;
}) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await rulesApi.createFromTemplate(token, input);
  revalidatePath('/dashboard/rules');
}

export async function toggleRuleAction(id: string, enable: boolean) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  if (enable) await rulesApi.enable(token, id);
  else await rulesApi.disable(token, id);
  revalidatePath('/dashboard/rules');
}

export async function deleteRuleAction(id: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await rulesApi.delete(token, id);
  revalidatePath('/dashboard/rules');
}
