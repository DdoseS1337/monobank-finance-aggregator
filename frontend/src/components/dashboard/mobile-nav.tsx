'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brain, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS_FOR_MOBILE } from './sidebar';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <div className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Brain className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-semibold">PFOS</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Закрити меню' : 'Відкрити меню'}
          aria-expanded={open}
          className="rounded-lg p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="space-y-1 border-b border-border bg-card px-4 py-2">
          {NAV_ITEMS_FOR_MOBILE.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
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
        </div>
      )}
    </div>
  );
}
