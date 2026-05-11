'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  BookOpen,
  Bot,
  Brain,
  CalendarRange,
  Coins,
  CreditCard,
  Inbox,
  LayoutDashboard,
  PieChart,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Огляд', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Витрати', href: '/dashboard/spending', icon: PieChart },
  { label: 'Бюджети', href: '/dashboard/budgets', icon: Wallet },
  { label: 'Цілі', href: '/dashboard/goals', icon: Target },
  { label: 'Cashflow', href: '/dashboard/cashflow', icon: TrendingUp },
  { label: 'Сценарії', href: '/dashboard/scenarios', icon: Sparkles },
  { label: 'Рекомендації', href: '/dashboard/recommendations', icon: Inbox },
  { label: 'Транзакції', href: '/dashboard/transactions', icon: CreditCard },
  { label: 'Правила', href: '/dashboard/rules', icon: Zap },
  { label: 'Сповіщення', href: '/dashboard/notifications', icon: Bell },
  { label: 'Бібліотека', href: '/dashboard/library', icon: BookOpen },
  { label: 'Асистент', href: '/dashboard/assistant', icon: Bot },
];

const SECONDARY_ITEMS: NavItem[] = [
  { label: 'Рахунки', href: '/dashboard/accounts', icon: Coins },
  { label: 'Налаштування', href: '/dashboard/settings', icon: Settings },
];

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname.startsWith(item.href);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-card">
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex h-16 items-center gap-3 px-6 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Brain className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">PFOS</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-border p-3">
          {SECONDARY_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export const NAV_ITEMS_FOR_MOBILE = NAV_ITEMS;
