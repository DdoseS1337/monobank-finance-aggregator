import { redirect } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { educationApi, getServerToken } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { LibrarySearch } from './library-search';
import { ArticleCard } from './article-card';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');

  const { items } = await educationApi
    .list(token)
    .catch(() => ({ items: [] }));

  const sections = new Map<string, typeof items>();
  for (const article of items) {
    const key = article.section ?? 'Інше';
    const bucket = sections.get(key) ?? [];
    bucket.push(article);
    sections.set(key, bucket);
  }
  const orderedSections = Array.from(sections.entries()).sort(([a], [b]) =>
    a.localeCompare(b, 'uk'),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Бібліотека"
        description="Короткі довідкові статті про фінансову грамотність в українському контексті. RAG-індекс над цією колекцією використовує AI-асистент."
      />

      <LibrarySearch />

      {items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Бібліотека порожня"
          description="Запустіть `npm run kb:index` у бекенді, щоб проіндексувати статті."
        />
      ) : (
        <div className="space-y-6">
          {orderedSections.map(([section, articles]) => (
            <section key={section} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section}{' '}
                <span className="text-muted-foreground/70">
                  · {articles.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {articles.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
