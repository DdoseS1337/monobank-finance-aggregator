'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/shared/markdown';
import type { KnowledgeArticleDto } from '@/lib/api';

interface Tags {
  difficulty?: string;
  tags?: string[];
}

const DIFFICULTY_COLOR: Record<string, string> = {
  BEGINNER: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  INTERMEDIATE: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  EXPERT: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
};

export function ArticleCard({
  article,
  initiallyOpen = false,
  similarity,
}: {
  article: KnowledgeArticleDto;
  initiallyOpen?: boolean;
  similarity?: number;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const meta = (article.metadata ?? {}) as Tags;
  const difficulty = meta.difficulty ?? null;
  const tags = Array.isArray(meta.tags) ? meta.tags.slice(0, 4) : [];

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/30"
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{article.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {difficulty && (
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-medium uppercase tracking-wide',
                  DIFFICULTY_COLOR[difficulty] ?? 'bg-muted/40 text-muted-foreground',
                )}
              >
                {difficulty}
              </span>
            )}
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-md bg-muted/40 px-1.5 py-0.5 text-muted-foreground"
              >
                {t}
              </span>
            ))}
            {similarity !== undefined && (
              <span className="ml-auto rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
                {(similarity * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border/50 bg-muted/10 px-4 py-3">
          <Markdown>{article.content}</Markdown>
        </div>
      )}
    </article>
  );
}
