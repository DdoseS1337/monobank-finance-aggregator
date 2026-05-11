'use server';

import { redirect } from 'next/navigation';
import { educationApi, getServerToken } from '@/lib/api';

export async function searchEducationAction(input: {
  q: string;
  k?: number;
  lang?: string;
}) {
  const token = await getServerToken();
  if (!token) redirect('/login');
  return educationApi.search(token, input);
}
