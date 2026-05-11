import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { getServerToken, recommendationsApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { RecommendationCard } from './recommendation-card';
import { RefreshButton } from './refresh-button';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');

  const items = await recommendationsApi
    .list(token, {
      status: ['PENDING', 'DELIVERED'],
      validOnly: true,
      limit: 50,
    })
    .catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Рекомендації"
        description="Hybrid pipeline (rules + LLM) → MCDM ранжування. Прийміть, відхиліть або відкладіть."
        actions={<RefreshButton />}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Inbox порожній"
          description="Системі поки нема що порадити. Натисніть «Перерахувати», щоб явно запустити pipeline."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id}>
              <RecommendationCard recommendation={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
