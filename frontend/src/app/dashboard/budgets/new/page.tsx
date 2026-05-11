import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { CreateBudgetForm } from './create-form';

export default function NewBudgetPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/budgets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Усі бюджети
      </Link>

      <PageHeader
        title="Створити бюджет"
        description="Виберіть метод і спосіб циклу. Перший період відкриється одразу."
      />

      <div className="rounded-xl border border-border bg-card p-6">
        <CreateBudgetForm />
      </div>
    </div>
  );
}
