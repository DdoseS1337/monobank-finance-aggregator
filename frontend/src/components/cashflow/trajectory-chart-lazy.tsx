'use client';

import dynamicImport from 'next/dynamic';
import type { ProjectionPointDto } from '@/lib/api';

const TrajectoryChart = dynamicImport(
  () =>
    import('./trajectory-chart').then((m) => m.TrajectoryChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    ),
  },
);

export function LazyTrajectoryChart({ points }: { points: ProjectionPointDto[] }) {
  return <TrajectoryChart points={points} />;
}
