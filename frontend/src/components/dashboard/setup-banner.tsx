'use client';

import Link from 'next/link';

export function SetupBanner() {
  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/20 text-primary flex-shrink-0">
          <svg
            aria-hidden="true"
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <p className="font-medium">Підключіть банк</p>
          <p className="text-sm text-muted-foreground">
            Синхронізуйте транзакції з Monobank, щоб побачити аналітику, патерни та прогнози.
          </p>
        </div>
      </div>
      <Link
        href="/setup"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 whitespace-nowrap flex-shrink-0"
      >
        Почати синхронізацію
      </Link>
    </div>
  );
}
