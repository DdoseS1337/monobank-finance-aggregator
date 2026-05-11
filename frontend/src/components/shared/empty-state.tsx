import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
