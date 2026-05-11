import { cn } from '@/lib/utils';

export type HealthStatus = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

const STATUS_LABEL: Record<HealthStatus, string> = {
  GREEN: 'У нормі',
  YELLOW: 'Увага',
  RED: 'Ризик',
  UNKNOWN: 'Немає даних',
};

const STATUS_BG: Record<HealthStatus, string> = {
  GREEN: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20',
  YELLOW: 'bg-amber-500/10 text-amber-600 ring-amber-500/20',
  RED: 'bg-red-500/10 text-red-600 ring-red-500/20',
  UNKNOWN: 'bg-muted text-muted-foreground ring-border',
};

interface HealthScoreBadgeProps {
  status: HealthStatus;
  label?: string;
  className?: string;
}

export function HealthScoreBadge({ status, label, className }: HealthScoreBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        STATUS_BG[status],
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'GREEN' && 'bg-emerald-500',
          status === 'YELLOW' && 'bg-amber-500',
          status === 'RED' && 'bg-red-500',
          status === 'UNKNOWN' && 'bg-muted-foreground/40',
        )}
      />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
