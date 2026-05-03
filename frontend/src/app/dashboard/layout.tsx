'use client';

import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { SetupBanner } from '@/components/dashboard/setup-banner';
import { useToken } from '@/hooks/use-token';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { hasToken, isReady } = useToken();

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <MobileNav />
      <main className="md:pl-64">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          {!hasToken && <SetupBanner />}
          {children}
        </div>
      </main>
    </div>
  );
}
