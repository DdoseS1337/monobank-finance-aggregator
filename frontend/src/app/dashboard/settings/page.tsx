import { redirect } from 'next/navigation';
import { getServerToken, personalizationApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { ProfileForm } from './profile-form';
import { TraitsCard } from './traits-card';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');
  const profile = await personalizationApi.get(token);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Персоналізація"
        description="Профіль ризику, тон рекомендацій, канали сповіщень і детектовані поведінкові ознаки."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold">Налаштування</h2>
          <ProfileForm initial={profile} />
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold">Поведінкові ознаки</h2>
          <TraitsCard traits={profile.behavioralTraits} />
        </section>
      </div>
    </div>
  );
}
