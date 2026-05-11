import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { CreateGoalForm } from './create-form';

export default function NewGoalPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/goals"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Усі цілі
      </Link>
      <PageHeader
        title="Нова ціль"
        description="Цільова сума, дедлайн і пріоритет — система згенерує feasibility-оцінку."
      />
      <div className="rounded-xl border border-border bg-card p-6">
        <CreateGoalForm />
      </div>
    </div>
  );
}
