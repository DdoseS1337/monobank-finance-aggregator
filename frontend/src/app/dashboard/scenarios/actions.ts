'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  getServerToken,
  scenariosApi,
  type ScenarioVariable,
} from '@/lib/api';

export async function createScenarioAction(input: {
  name: string;
  variables: ScenarioVariable[];
}) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const scenario = await scenariosApi.create(token, {
    name: input.name,
    variables: input.variables,
    runNow: true,
  });
  revalidatePath('/dashboard/scenarios');
  return { id: scenario.id };
}

export async function deleteScenarioAction(id: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await scenariosApi.delete(token, id);
  revalidatePath('/dashboard/scenarios');
}

export async function resimulateScenarioAction(id: string) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  await scenariosApi.resimulate(token, id);
  revalidatePath('/dashboard/scenarios');
}
