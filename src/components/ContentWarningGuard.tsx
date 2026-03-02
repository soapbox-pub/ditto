/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { ShieldAlert, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Extracts the content-warning reason from an event's tags (NIP-36).
 * Returns the reason string, or an empty string if the tag is present with no reason,
 * or undefined if there is no content-warning tag.
 *
 * Checks both the `content-warning` tag value and the NIP-32 `l` tag with
 * the `content-warning` namespace, since some clients put the reason only
 * in the label tag.
 */
export function getContentWarning(event: NostrEvent): string | undefined {
  const tag = event.tags.find(([name]) => name === 'content-warning');
  if (!tag) return undefined;

  // Prefer the reason from the content-warning tag itself
  const reason = tag[1]?.trim();
  if (reason) return reason;

  // Fall back to the NIP-32 label tag with content-warning namespace
  const lTag = event.tags.find(
    ([name, , namespace]) => name === 'l' && namespace === 'content-warning',
  );
  if (lTag?.[1]?.trim()) return lTag[1].trim();

  return '';
}

interface ContentWarningGuardProps {
  /** The Nostr event to check for content-warning tags. */
  event: NostrEvent;
  /** Content that should only render when the warning is dismissed. */
  children: React.ReactNode;
  /** Optional class name for the warning overlay container. */
  className?: string;
}

/**
 * Guards children behind a content-warning overlay based on the user's
 * contentWarningPolicy setting.
 *
 * - "blur": Shows a warning overlay. Children are **not mounted** (and therefore
 *   media is never fetched) until the user explicitly reveals.
 * - "hide": Returns null — the entire post should be hidden by the parent.
 * - "show": Renders children immediately with no overlay.
 *
 * If the event has no content-warning tag, children render normally regardless
 * of the policy setting.
 */
export function ContentWarningGuard({ event, children, className }: ContentWarningGuardProps) {
  const { config } = useAppContext();
  const [revealed, setRevealed] = useState(false);

  const reason = getContentWarning(event);

  // No content-warning tag — render normally
  if (reason === undefined) {
    return <>{children}</>;
  }

  const policy = config.contentWarningPolicy;

  // Policy: always show — ignore the warning
  if (policy === 'show') {
    return <>{children}</>;
  }

  // Policy: hide — parent should filter this out, but as a fallback return null
  if (policy === 'hide') {
    return null;
  }

  // Policy: blur (default) — show overlay until revealed
  if (revealed) {
    return <>{children}</>;
  }

  return (
    <div className={cn('relative mt-2 rounded-xl overflow-hidden', className)}>
      {/* Blurred filler — contained within the rounded box */}
      <div className="bg-muted/40 blur-lg select-none" aria-hidden>
        <div className="px-4 pt-4 pb-2 space-y-2.5">
          <div className="h-3.5 w-full rounded bg-muted/60" />
          <div className="h-3.5 w-4/5 rounded bg-muted/60" />
          <div className="h-3.5 w-3/5 rounded bg-muted/60" />
        </div>
        <div className="mx-4 mb-4 mt-1 h-32 rounded-lg bg-muted/60" />
      </div>

      {/* Centered overlay — positioned over the filler */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-4 text-center">
        <div className="flex items-center justify-center size-10 rounded-full bg-background/80 shadow-sm backdrop-blur-sm">
          <ShieldAlert className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1 max-w-xs">
          <p className="text-sm font-medium text-foreground">Content Warning</p>
          {reason ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              &ldquo;{reason}&rdquo;
            </p>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              The author flagged this post as sensitive.
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 mt-0.5 rounded-full px-5 bg-background/80 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(true);
          }}
        >
          <Eye className="size-3.5" />
          Show Content
        </Button>
      </div>
    </div>
  );
}
