import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defence-in-depth — proxy already redirects unauthenticated users; this
  // guard handles bypass attempts and lets nested pages assume the session
  // exists.
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <MobileNav />
      <main className="md:pl-64">
        <div className="mx-auto max-w-7xl space-y-6 p-6">{children}</div>
      </main>
    </div>
  );
}
