'use client';

import { useTransition } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dismissAction, markOpenedAction } from './actions';
import type { NotificationDto } from '@/lib/api';

const SEVERITY_RING: Record<NotificationDto['severity'], string> = {
  INFO: 'ring-border',
  WARNING: 'ring-amber-500/30 bg-amber-500/5',
  CRITICAL: 'ring-red-500/30 bg-red-500/5',
};

interface Props {
  notification: NotificationDto;
}

export function NotificationItem({ notification: n }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg p-4 ring-1 ring-inset',
        SEVERITY_RING[n.severity],
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background">
        <Bell className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{n.kind}</p>
          <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {n.channel}
          </span>
          <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {n.severity}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Заплановано:{' '}
          {new Date(n.scheduledFor).toLocaleString('uk-UA', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </p>
        {Object.keys(n.payload).length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Payload
            </summary>
            <pre className="mt-1 overflow-x-auto rounded-md bg-background/60 p-2 text-[11px] leading-relaxed">
              {JSON.stringify(n.payload, null, 2)}
            </pre>
          </details>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startTransition(() => markOpenedAction(n.id))}
          disabled={pending}
        >
          Прочитано
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startTransition(() => dismissAction(n.id))}
          disabled={pending}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
