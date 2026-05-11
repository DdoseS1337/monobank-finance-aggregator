import { cn } from '@/lib/utils';
import type { FeasibilityCategory } from '@/lib/api';

interface Props {
  score: number | null;
  category: FeasibilityCategory;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const COLOR: Record<FeasibilityCategory, string> = {
  AT_RISK: 'stroke-red-500',
  TIGHT: 'stroke-amber-500',
  COMFORTABLE: 'stroke-emerald-500',
  AHEAD: 'stroke-emerald-500',
  UNKNOWN: 'stroke-muted-foreground/40',
};

const LABEL: Record<FeasibilityCategory, string> = {
  AT_RISK: 'Під ризиком',
  TIGHT: 'Напружено',
  COMFORTABLE: 'Комфортно',
  AHEAD: 'З запасом',
  UNKNOWN: 'Замало даних',
};

export function FeasibilityRing({ score, category, size = 'md', className }: Props) {
  const dim = size === 'sm' ? 56 : size === 'lg' ? 96 : 72;
  const stroke = size === 'sm' ? 6 : size === 'lg' ? 10 : 8;
  const radius = (dim - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = score === null ? 0 : Math.max(0, Math.min(1, score));
  const offset = circumference - circumference * value;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg width={dim} height={dim} className="-rotate-90" aria-hidden>
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          strokeWidth={stroke}
          className="stroke-muted/40"
          fill="none"
        />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(COLOR[category], 'transition-[stroke-dashoffset] duration-500')}
          fill="none"
        />
      </svg>
      <div className="space-y-0.5 text-sm">
        <p className="font-semibold tabular-nums">
          {score === null ? '—' : `${Math.round(value * 100)}%`}
        </p>
        <p className="text-xs text-muted-foreground">{LABEL[category]}</p>
      </div>
    </div>
  );
}
