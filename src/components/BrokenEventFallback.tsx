import { Frown } from 'lucide-react';

import { cn } from '@/lib/utils';

interface BrokenEventFallbackProps {
  /** Renders a smaller variant suitable for inline embeds inside other cards. */
  compact?: boolean;
  className?: string;
}

/**
 * Inline tombstone shown when an event's renderer throws.
 *
 * Used by the per-card and per-embed error boundaries so a single malformed
 * event can't crash an entire feed or its host card. Visual chrome mirrors
 * `UnknownKindContent`'s unsupported-kind fallback to keep the surface
 * consistent across "can't render" cases.
 */
export function BrokenEventFallback({ compact = false, className }: BrokenEventFallbackProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-border',
        compact ? 'mt-1' : 'mt-2',
        className,
      )}
    >
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 text-center text-muted-foreground',
          compact ? 'px-3 py-3 text-xs' : 'px-3.5 py-4 text-sm',
        )}
      >
        <Frown className={cn(compact ? 'size-4' : 'size-5')} aria-hidden="true" />
        <span>This post could not be displayed</span>
      </div>
    </div>
  );
}
