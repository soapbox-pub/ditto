import { useState } from 'react';
import { Braces, FileQuestion } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { EventJsonDialog } from '@/components/EventJsonDialog';
import { Button } from '@/components/ui/button';
import { getEventFallbackText } from '@/lib/extraKinds';
import { getKindLabel } from '@/lib/kindLabels';
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
 * Surfaces the NIP-31 `alt` tag (with fallbacks to title/name/summary/d) when
 * present, and always offers a "View event" action so the user can inspect,
 * copy, or rebroadcast the raw event instead of hitting a dead end.
 */
export function UnknownKindContent({ event, expanded = false, className }: UnknownKindContentProps) {
  const [jsonOpen, setJsonOpen] = useState(false);

  const fallbackText = getEventFallbackText(event);
  // getKindLabel falls back to "Kind <n>" for kinds absent from the registry,
  // so this is always a meaningful noun phrase.
  const label = getKindLabel(event.kind);
  // Avoid a redundant "· Kind 1234" chip when the label already *is* "Kind 1234".
  const showKindChip = label !== `Kind ${event.kind}`;

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-secondary/30 overflow-hidden',
        expanded ? 'mt-3 p-4' : 'mt-2 p-3',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FileQuestion className="size-5" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{label}</p>
            {showKindChip && (
              <span className="shrink-0 text-xs text-muted-foreground">Kind {event.kind}</span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Ditto can&rsquo;t display this event type yet.
          </p>

          {fallbackText && (
            <p
              className={cn(
                'whitespace-pre-wrap break-words pt-1 text-foreground',
                expanded ? 'text-[15px] leading-relaxed' : 'text-sm leading-relaxed',
              )}
            >
              {fallbackText}
            </p>
          )}

          <div className="pt-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setJsonOpen(true);
              }}
            >
              <Braces className="size-3.5" />
              View event
            </Button>
          </div>
        </div>
      </div>

      <EventJsonDialog event={event} open={jsonOpen} onOpenChange={setJsonOpen} />
    </div>
  );
}
