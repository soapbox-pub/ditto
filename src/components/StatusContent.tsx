import { useMemo } from 'react';
import { ExternalLink, Music, SmilePlus } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmojifiedText } from '@/components/CustomEmoji';
import { LinkEmbed } from '@/components/LinkEmbed';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface StatusContentProps {
  event: NostrEvent;
  /** When true, render a larger variant for the detail page. */
  expanded?: boolean;
  className?: string;
}

/** Extract the hostname (without leading `www.`) from a URL, or `undefined` on failure. */
function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/**
 * Renders a NIP-38 User Status event (kind 30315).
 *
 * - The `d` tag is the status type: `general`, `music`, or a custom string.
 * - `content` is the status text and may contain NIP-30 custom emoji.
 * - An optional `r` tag links to a URL, note, or profile.
 * - A NIP-40 `expiration` tag whose timestamp has passed means the status
 *   has been cleared, and empty `content` clears it too (per NIP-38).
 */
export function StatusContent({ event, expanded = false, className }: StatusContentProps) {
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? 'general';
  const isMusic = dTag === 'music';
  const text = event.content.trim();
  const url = useMemo(
    () => sanitizeUrl(event.tags.find(([n]) => n === 'r')?.[1]),
    [event.tags],
  );

  // NIP-40 expiration — a timestamp in the past means the status is cleared.
  const isExpired = useMemo(() => {
    const expTag = event.tags.find(([n]) => n === 'expiration')?.[1];
    if (!expTag) return false;
    const t = parseInt(expTag, 10);
    return !Number.isNaN(t) && Math.floor(Date.now() / 1000) > t;
  }, [event.tags]);

  const Icon = isMusic ? Music : SmilePlus;
  const label = isMusic
    ? 'Listening to'
    : dTag === 'general'
      ? 'Status'
      : `${dTag} status`;

  // Empty content (NIP-38 "clear") or an expired status has nothing to show.
  const cleared = !text || isExpired;

  return (
    <div className={cn(expanded ? 'mt-3 space-y-3' : 'mt-2 space-y-2.5', className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3 shrink-0" />
        {label}
      </div>

      {cleared ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted-foreground">
          {isExpired ? 'This status has expired' : 'No status set'}
        </div>
      ) : (
        <p
          dir="auto"
          className={cn(
            'whitespace-pre-wrap break-words font-medium text-foreground',
            expanded ? 'text-[22px] leading-snug' : 'text-[17px] leading-snug',
          )}
        >
          <EmojifiedText tags={event.tags}>{text}</EmojifiedText>
        </p>
      )}

      {/* Linked URL — a rich preview on the detail page, a compact chip in the feed. */}
      {!cleared && url && (
        expanded ? (
          <LinkEmbed url={url} showActions={false} />
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="size-3 shrink-0" />
            {hostnameOf(url) ?? url}
          </a>
        )
      )}
    </div>
  );
}
