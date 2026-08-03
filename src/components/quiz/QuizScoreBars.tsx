import { cn } from '@/lib/utils';

import type { QuizResultScore } from '@/lib/quiz';

interface QuizScoreBarsProps {
  scores: QuizResultScore[];
  className?: string;
}

/** Format a score value compactly (drop trailing `.0`). */
function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Horizontal bar visualization of per-dimension quiz scores.
 * Bars are normalized against each dimension's theoretical min/max when
 * available; dimensions without bounds normalize against the largest
 * absolute value in the set.
 */
export function QuizScoreBars({ scores, className }: QuizScoreBarsProps) {
  if (scores.length === 0) return null;

  const fallbackMax = Math.max(1, ...scores.map((s) => Math.abs(s.value)));

  return (
    <div className={cn('space-y-2', className)}>
      {scores.map((score) => {
        const min = score.min ?? 0;
        const max = score.max ?? fallbackMax;
        const span = max - min;
        const percent = span > 0
          ? Math.min(100, Math.max(0, ((score.value - min) / span) * 100))
          : 100;

        return (
          <div key={score.dimension}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium text-foreground">
                {score.label ?? score.dimension}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {formatValue(score.value)}
              </span>
            </div>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-secondary"
              role="meter"
              aria-valuenow={score.value}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-label={score.label ?? score.dimension}
            >
              <div
                className="h-full rounded-full bg-primary transition-all motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
