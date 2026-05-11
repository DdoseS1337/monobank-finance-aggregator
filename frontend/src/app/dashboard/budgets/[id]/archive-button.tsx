'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { archiveBudgetAction } from '../actions';

export function ArchiveButton({ budgetId }: { budgetId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onClick = () => {
    if (!confirm('Архівувати цей бюджет? Дію можна скасувати лише через відновлення з історії.')) {
      return;
    }
    startTransition(async () => {
      await archiveBudgetAction(budgetId);
      router.push('/dashboard/budgets');
    });
  };

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      <Trash2 className="mr-1 h-3.5 w-3.5" />
      {pending ? 'Архівую…' : 'Архівувати'}
    </Button>
  );
}
