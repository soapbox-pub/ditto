import type { NostrEvent } from '@nostrify/nostrify';

import { getEventFallbackText } from '@/lib/extraKinds';
import { cn } from '@/lib/utils';

interface UnknownKindContentProps {
  event: NostrEvent;
  /** When true, renders a larger variant for the detail page. */
  expanded?: boolean;
  className?: string;
}

/**
 * Fallback renderer for event kinds this client doesn't know how to display.
 *
 * Never runs the text-note tokenizer (URLs, hashtags, nostr: mentions) over
 * arbitrary content — that would misinterpret JSON or empty bodies as kind 1.
 * Surfaces the NIP-31 `alt` tag (with fallbacks to title/name/summary/d), or a
 * neutral tombstone when nothing is available.
 */
export function UnknownKindContent({ event, expanded = false, className }: UnknownKindContentProps) {
  const fallbackText = getEventFallbackText(event);

  if (fallbackText) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border bg-secondary/30 overflow-hidden',
          expanded ? 'mt-3 p-4' : 'mt-2 p-3',
          className,
        )}
      >
        <p
          className={cn(
            'whitespace-pre-wrap break-words text-foreground',
            expanded ? 'text-[15px] leading-relaxed' : 'text-sm leading-relaxed',
          )}
        >
          {fallbackText}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-border',
        expanded ? 'mt-3' : 'mt-2',
        className,
      )}
    >
      <div className="px-3.5 py-4 text-center text-sm text-muted-foreground">
        This event kind is not supported
      </div>
    </div>
  );
}
