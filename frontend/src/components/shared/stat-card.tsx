import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  trend?: 'up' | 'down' | 'flat';
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

const TREND_COLOR = {
  up: 'text-emerald-600',
  down: 'text-red-600',
  flat: 'text-muted-foreground',
} as const;

export function StatCard({ label, value, hint, trend = 'flat', icon: Icon, className }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-5 shadow-sm', className)}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className={cn('h-4 w-4', TREND_COLOR[trend])} />}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className={cn('mt-1 text-xs', TREND_COLOR[trend])}>{hint}</p>}
    </div>
  );
}
