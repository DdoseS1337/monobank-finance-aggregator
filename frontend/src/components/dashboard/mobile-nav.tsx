'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useToken } from '@/hooks/use-token';

const navItems = [
  { label: 'Огляд', href: '/dashboard' },
  { label: 'Аналітика', href: '/dashboard/analytics' },
  { label: 'Транзакції', href: '/dashboard/transactions' },
  { label: 'Патерни', href: '/dashboard/patterns' },
  { label: 'Інсайти', href: '/dashboard/insights' },
  { label: 'Прогноз', href: '/dashboard/forecast' },
  { label: 'Асистент', href: '/dashboard/assistant' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { clearToken } = useToken();

  return (
    <div className="md:hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">₴</span>
          </div>
          <span className="font-semibold">ФінДашборд</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Закрити меню' : 'Відкрити меню'}
          aria-expanded={open}
          className="p-2 hover:bg-muted rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? (
            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="border-b border-border bg-card px-4 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'block px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/setup"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            Синхронізувати ще
          </Link>
          <button
            onClick={() => {
              if (window.confirm('Змінити токен? Ви будете перенаправлені на сторінку налаштувань.')) {
                clearToken();
                setOpen(false);
              }
            }}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            Змінити токен
          </button>
        </div>
      )}
    </div>
  );
}
