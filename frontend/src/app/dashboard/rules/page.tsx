import { redirect } from 'next/navigation';
import { Zap } from 'lucide-react';
import { getServerToken, rulesApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { TemplatePicker } from './template-picker';
import { RulesList } from './rules-list';

export const dynamic = 'force-dynamic';

export default async function RulesPage() {
  const token = await getServerToken();
  if (!token) redirect('/login');

  const [rules, templates] = await Promise.all([
    rulesApi.list(token).catch(() => []),
    rulesApi.templates(token).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Правила автоматизації"
        description="Подія → умова → дія. Ввімкніть готовий шаблон або створіть свій (advanced builder — у Phase 7)."
      />

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Готові шаблони</h2>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Шаблони не знайдено.</p>
        ) : (
          <TemplatePicker templates={templates} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Активні та неактивні правила</h2>
        {rules.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="Жодного правила"
            description="Виберіть шаблон вище — це найшвидший спосіб запустити автоматизацію."
          />
        ) : (
          <RulesList rules={rules} />
        )}
      </section>
    </div>
  );
}
