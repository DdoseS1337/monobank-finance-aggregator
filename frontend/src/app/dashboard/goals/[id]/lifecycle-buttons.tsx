'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  abandonGoalAction,
  pauseGoalAction,
  recalcFeasibilityAction,
  resumeGoalAction,
} from '../actions';
import type { GoalStatus } from '@/lib/api';

interface Props {
  goalId: string;
  status: GoalStatus;
}

export function LifecycleButtons({ goalId, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onPause = () => startTransition(() => pauseGoalAction(goalId));
  const onResume = () => startTransition(() => resumeGoalAction(goalId));
  const onRecalc = () => startTransition(() => recalcFeasibilityAction(goalId));
  const onAbandon = () => {
    if (!confirm('Залишити цю ціль і позначити як облишену? Дію неможливо скасувати.')) return;
    startTransition(async () => {
      await abandonGoalAction(goalId);
      router.push('/dashboard/goals');
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onRecalc} disabled={pending}>
        Перерахувати feasibility
      </Button>
      {status === 'ACTIVE' && (
        <Button variant="outline" size="sm" onClick={onPause} disabled={pending}>
          <Pause className="mr-1 h-3.5 w-3.5" /> Пауза
        </Button>
      )}
      {status === 'PAUSED' && (
        <Button variant="outline" size="sm" onClick={onResume} disabled={pending}>
          <Play className="mr-1 h-3.5 w-3.5" /> Відновити
        </Button>
      )}
      {(status === 'ACTIVE' || status === 'PAUSED') && (
        <Button variant="destructive" size="sm" onClick={onAbandon} disabled={pending}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Облишити
        </Button>
      )}
    </div>
  );
}
