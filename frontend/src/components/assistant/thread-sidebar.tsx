'use client';

import { cn } from '@/lib/utils';
import type { AiThread } from '@/lib/types';

interface Props {
  threads: AiThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ThreadSidebar({ threads, activeId, onSelect, onNew, onDelete }: Props) {
  return (
    <div className="flex flex-col h-full">
      <button
        onClick={onNew}
        className="mx-3 mt-3 mb-2 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Нова розмова
      </button>

      <div className="flex-1 overflow-y-auto px-1">
        {threads.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 px-3">
            Тут з&apos;являться ваші розмови
          </p>
        ) : (
          <ul className="space-y-0.5 px-2 pb-3">
            {threads.map((t) => (
              <li key={t.id}>
                <div
                  className={cn(
                    'group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors',
                    activeId === t.id
                      ? 'bg-muted text-foreground'
                      : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground',
                  )}
                >
                  <button
                    onClick={() => onSelect(t.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="truncate">{t.title ?? 'Без назви'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {new Date(t.lastMessageAt).toLocaleDateString('uk-UA')}
                      {t.model && ` · ${t.model}`}
                    </p>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Видалити цю розмову?')) onDelete(t.id);
                    }}
                    aria-label="Видалити"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
