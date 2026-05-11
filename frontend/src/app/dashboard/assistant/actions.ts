'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { aiApi, getServerToken } from '@/lib/api';

export async function sendChatAction(input: { message: string; sessionId?: string }) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  return aiApi.chat(token, input);
}

export async function confirmStagedAction(stagedActionId: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const result = await aiApi.confirm(token, stagedActionId);
  // Invalidate the broad UI surface — we don't know which entity was touched.
  revalidatePath('/dashboard', 'layout');
  return result;
}

export async function rejectStagedAction(stagedActionId: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await aiApi.reject(token, stagedActionId);
}

export async function listChatSessions() {
  const token = await getServerToken();
  if (!token) redirect('/login');
  return aiApi.listSessions(token);
}

export async function loadChatSession(sessionId: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  return aiApi.getSession(token, sessionId);
}
