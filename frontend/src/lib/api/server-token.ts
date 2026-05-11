import 'server-only';
import { createClient as createServerSupabase } from '../supabase/server';

/**
 * Helper for Server Components / Server Actions that need to call the
 * PFOS backend on behalf of the current user.
 *
 *   const token = await getServerToken();
 *   const data = await fetchBudgets(token);
 *
 * Returns null when the user is not authenticated — the caller decides
 * whether to redirect or render a guarded fallback.
 */
export async function getServerToken(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
