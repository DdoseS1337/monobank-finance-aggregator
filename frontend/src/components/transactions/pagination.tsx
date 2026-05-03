'use client';

import { Button } from '@/components/ui/button';

interface PaginationProps {
  skip: number;
  take: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function Pagination({ skip, take, hasMore, onPrev, onNext }: PaginationProps) {
  const page = Math.floor(skip / take) + 1;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Сторінка {page}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={skip === 0}
        >
          Попередня
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!hasMore}
        >
          Наступна
        </Button>
      </div>
    </div>
  );
}
