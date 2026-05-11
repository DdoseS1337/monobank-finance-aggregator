'use client';

import { useState, useTransition } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchEducationAction } from './actions';
import { ArticleCard } from './article-card';
import type { KnowledgeArticleDto } from '@/lib/api';

const PRESETS = [
  'Як планувати пенсію в Україні?',
  'Що таке ОВДП і чи вигідно?',
  'Як виявити приховані підписки?',
  'У чому різниця між ФОП-2 і ФОП-3?',
  'Складний відсоток на пальцях',
];

export function LibrarySearch() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KnowledgeArticleDto[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setError(null);
    startTransition(async () => {
      try {
        const result = await searchEducationAction({ q: trimmed, k: 5 });
        setHits(result.hits);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Помилка пошуку');
      }
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        Семантичний пошук (RAG)
      </div>
      <p className="text-xs text-muted-foreground">
        Запит обробляється через embedding-модель і шукає за смислом, а не за
        точними словами. Той самий індекс використовує AI-асистент.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Спитайте про щось, наприклад: 'як зменшити витрати на каву'"
          className="flex-1 min-w-64"
          disabled={pending}
        />
        <Button type="submit" disabled={pending || !query.trim()}>
          <Search className="mr-1 h-3.5 w-3.5" />
          Шукати
        </Button>
      </form>

      <div className="flex flex-wrap gap-2 text-xs">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => run(p)}
            disabled={pending}
            className="rounded-md border border-border bg-muted/30 px-2 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {p}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {hits && (
        <div className="space-y-2 pt-2">
          {hits.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Нічого не знайдено за запитом "{query}".
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Знайдено {hits.length} статей. Сортовано за схожістю.
              </p>
              {hits.map((h) => (
                <ArticleCard
                  key={h.id}
                  article={h}
                  similarity={h.similarity}
                  initiallyOpen={hits.length <= 2}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
