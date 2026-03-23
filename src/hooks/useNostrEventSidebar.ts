import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

/** Minimal data needed to render a non-profile event in the sidebar. */
export interface NostrEventSidebarData {
  /** Display label for the sidebar item. */
  label: string;
  /** The event kind, for icon resolution. */
  kind: number;
}

/** Params to identify the event — either by ID or by addressable pointer. */
export interface EventSidebarParams {
  /** Event ID for note/nevent lookups. */
  eventId?: string;
  /** For naddr lookups: kind + pubkey + d-tag. */
  addr?: { kind: number; pubkey: string; identifier: string };
}

/**
 * Fetches minimal event data for rendering a non-profile Nostr event
 * in the sidebar. Extracts a human-readable label from the event's
 * tags or content.
 */
export function useNostrEventSidebar(params: EventSidebarParams) {
  const { nostr } = useNostr();
  const { eventId, addr } = params;

  const queryKey = eventId
    ? ['nostr-event-sidebar', 'id', eventId]
    : addr
      ? ['nostr-event-sidebar', 'addr', addr.kind, addr.pubkey, addr.identifier]
      : ['nostr-event-sidebar', 'none'];

  const enabled = !!(eventId || addr);

  return useQuery<NostrEventSidebarData | null>({
    queryKey,
    queryFn: async ({ signal }) => {
      let filter: NostrFilter;

      if (eventId) {
        filter = { ids: [eventId], limit: 1 };
      } else if (addr) {
        filter = {
          kinds: [addr.kind],
          authors: [addr.pubkey],
          '#d': [addr.identifier],
          limit: 1,
        };
      } else {
        return null;
      }

      const events = await nostr.query([filter], { signal });

      if (events.length === 0) return null;

      const event = events[0];
      return {
        label: extractEventLabel(event),
        kind: event.kind,
      };
    },
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
    retry: 1,
  });
}

/** Extract a human-readable label from a Nostr event for sidebar display. */
function extractEventLabel(event: NostrEvent): string {
  // Try common tag-based labels first
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  if (title) return truncateLabel(title);

  const name = event.tags.find(([n]) => n === 'name')?.[1];
  if (name) return truncateLabel(name);

  const subject = event.tags.find(([name]) => name === 'subject')?.[1];
  if (subject) return truncateLabel(subject);

  const d = event.tags.find(([name]) => name === 'd')?.[1];
  if (d) return truncateLabel(d);

  // Fall back to content preview
  if (event.content) {
    return truncateLabel(event.content);
  }

  return 'Event';
}

function truncateLabel(text: string, maxLen = 24): string {
  const clean = text.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '\u2026';
}
