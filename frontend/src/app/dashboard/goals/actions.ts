'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerToken, goalsApi, type Currency, type GoalType } from '@/lib/api';

interface CreateGoalInput {
  type: GoalType;
  name: string;
  description?: string;
  targetAmount: string;
  baseCurrency: Currency;
  deadline?: string;
  priority?: number;
}

export async function createGoalAction(input: CreateGoalInput) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const goal = await goalsApi.create(token, input);
  revalidatePath('/dashboard/goals');
  revalidatePath('/dashboard');
  return { id: goal.id };
}

export async function contributeAction(goalId: string, amount: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await goalsApi.contribute(token, goalId, amount);
  revalidatePath(`/dashboard/goals/${goalId}`);
  revalidatePath('/dashboard/goals');
  revalidatePath('/dashboard');
}

export async function pauseGoalAction(goalId: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await goalsApi.pause(token, goalId);
  revalidatePath(`/dashboard/goals/${goalId}`);
  revalidatePath('/dashboard/goals');
}

export async function resumeGoalAction(goalId: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await goalsApi.resume(token, goalId);
  revalidatePath(`/dashboard/goals/${goalId}`);
  revalidatePath('/dashboard/goals');
}

export async function abandonGoalAction(goalId: string, reason?: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await goalsApi.abandon(token, goalId, reason);
  revalidatePath(`/dashboard/goals/${goalId}`);
  revalidatePath('/dashboard/goals');
  revalidatePath('/dashboard');
}

export async function recalcFeasibilityAction(goalId: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await goalsApi.recalcFeasibility(token, goalId);
  revalidatePath(`/dashboard/goals/${goalId}`);
  revalidatePath('/dashboard/goals');
}

export async function adjustDeadlineAction(goalId: string, newDeadline: string | null) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await goalsApi.adjustDeadline(token, goalId, newDeadline);
  revalidatePath(`/dashboard/goals/${goalId}`);
  revalidatePath('/dashboard/goals');
  revalidatePath('/dashboard');
}

export async function adjustTargetAction(goalId: string, newTarget: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await goalsApi.adjustTarget(token, goalId, newTarget);
  revalidatePath(`/dashboard/goals/${goalId}`);
  revalidatePath('/dashboard/goals');
  revalidatePath('/dashboard');
}
