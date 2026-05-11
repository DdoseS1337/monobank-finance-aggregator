import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { getServerToken, scenariosApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ScenarioBuilder } from './scenario-builder';
import { ScenarioList } from './scenario-list';

export const dynamic = 'force-dynamic';

export default async function ScenariosPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const scenarios = await scenariosApi.list(token).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="What-if сценарії"
        description="Накладіть зміну (нова ціль, ріст доходу, скорочення категорії) і подивіться різницю проти baseline."
      />

      <ScenarioBuilder />

      {scenarios.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Немає збережених сценаріїв"
          description="Створіть перший сценарій вище — система обрахує дельти ключових метрик."
        />
      ) : (
        <ScenarioList scenarios={scenarios} />
      )}
    </div>
  );
}
