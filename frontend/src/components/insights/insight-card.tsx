'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import type { Insight } from '@/lib/types';

const SEVERITY_STYLES: Record<Insight['severity'], {
  bar: string;
  icon: string;
  badge: string;
  label: string;
}> = {
  critical: {
    bar: 'bg-red-500',
    icon: 'text-red-400 bg-red-500/10',
    badge: 'text-red-400 border-red-400/30',
    label: 'Критично',
  },
  warning: {
    bar: 'bg-yellow-500',
    icon: 'text-yellow-400 bg-yellow-500/10',
    badge: 'text-yellow-400 border-yellow-400/30',
    label: 'Попередження',
  },
  info: {
    bar: 'bg-blue-500',
    icon: 'text-blue-400 bg-blue-500/10',
    badge: 'text-muted-foreground',
    label: 'Інфо',
  },
};

const TYPE_LABELS: Record<Insight['type'], string> = {
  anomaly: 'Аномалія',
  category_spike: 'Зростання',
  unusual_purchase: 'Нетипова',
  conclusion: 'Висновок',
};

function TypeIcon({ type }: { type: Insight['type'] }) {
  switch (type) {
    case 'anomaly':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    case 'category_spike':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      );
    case 'unusual_purchase':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case 'conclusion':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
  }
}

export function InsightCard({ insight }: { insight: Insight }) {
  const styles = SEVERITY_STYLES[insight.severity];

  return (
    <Card className="overflow-hidden">
      <div className="flex">
        <div className={`w-1 ${styles.bar}`} />
        <div className="flex-1 p-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg flex-shrink-0 ${styles.icon}`}>
              <TypeIcon type={insight.type} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{insight.title}</h3>
                <Badge variant="outline" className={styles.badge}>
                  {TYPE_LABELS[insight.type]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {insight.description}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {formatDate(insight.date)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
