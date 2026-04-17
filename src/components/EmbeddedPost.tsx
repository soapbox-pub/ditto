import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { ProfilePreview } from '@/components/ExternalContentHeader';
import { cn } from '@/lib/utils';

interface EmbeddedPostProps {
  /** The event to render. */
  event: NostrEvent;
  /** Extra classes applied to the outermost wrapper. */
  className?: string;
  /** When true, ProfileHoverCards inside the card are disabled to prevent nested hover cards. */
  disableHoverCards?: boolean;
}

/**
 * Compact embedded preview of a Nostr event.
 *
 * Delegates to the shared `EmbeddedNote` / `EmbeddedNaddr` components used by
 * quote posts, reply indicators, comment context, and hover cards so every
 * surface that previews an event renders it consistently — regardless of
 * whether it's a text note, an addressable event (article, people list,
 * badge…), or a profile (kind 0).
 */
export function EmbeddedPost({ event, className, disableHoverCards }: EmbeddedPostProps) {
  // Kind 0 (profile) — show a profile card instead of trying to render the raw JSON content
  if (event.kind === 0) {
    return (
      <div className={cn('rounded-xl border border-border bg-secondary/30 overflow-hidden', className)}>
        <ProfilePreview pubkey={event.pubkey} />
      </div>
    );
  }

  // Addressable events (kind 30000-39999) — use EmbeddedNaddr
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
    return (
      <EmbeddedNaddr
        addr={{ kind: event.kind, pubkey: event.pubkey, identifier: dTag }}
        className={className}
        disableHoverCards={disableHoverCards}
      />
    );
  }

  // Everything else — use EmbeddedNote (the event is already in the query cache)
  return (
    <EmbeddedNote
      eventId={event.id}
      authorHint={event.pubkey}
      className={className}
      disableHoverCards={disableHoverCards}
    />
  );
}
