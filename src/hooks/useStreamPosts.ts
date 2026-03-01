import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo } from 'react';
import { useFeedSettings } from './useFeedSettings';
import { useMuteList } from './useMuteList';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { isReplyEvent } from '@/lib/nostrEvents';
import { isEventMuted } from '@/lib/muteHelpers';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { DITTO_RELAY } from '@/lib/appRelays';

interface StreamPostsOptions {
  includeReplies: boolean;
  mediaType: 'all' | 'images' | 'videos' | 'vines' | 'none';
  language?: string;
  /** Protocol strings to pass as protocol: search terms. Defaults to ['nostr']. */
  protocols?: string[];
}

/** Check if an event has imeta tags with image MIME types. */
function hasImageImeta(event: NostrEvent): boolean {
  return event.tags.some(
    (tag) => tag[0] === 'imeta' && tag.slice(1).some((part) => part.startsWith('m ') && part.split(' ')[1]?.startsWith('image/')),
  );
}

/** Check if an event has imeta tags with video MIME types. */
function hasVideoImeta(event: NostrEvent): boolean {
  return event.tags.some(
    (tag) => tag[0] === 'imeta' && tag.slice(1).some((part) => part.startsWith('m ') && part.split(' ')[1]?.startsWith('video/')),
  );
}

/**
 * Client-side filtering for streaming events.
 * Initial query uses relay-level filters (NIP-50 search), but streaming
 * events need client-side filtering since relays don't support streaming search.
 */
function filterEvent(event: NostrEvent, options: StreamPostsOptions, searchQuery: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (event.created_at > now) return false;

  // Non-text events (extra kinds) pass through without filtering
  // Kind 1111 (NIP-22 comments) are treated like kind 1 for filtering purposes
  if (event.kind !== 1 && event.kind !== 1111) return true;

  // Filter replies
  if (!options.includeReplies) {
    if (isReplyEvent(event)) return false;
  }

  // Client-side search (for streaming events only - initial query uses relay search)
  if (searchQuery.trim()) {
    const lowerContent = event.content.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    if (!lowerContent.includes(lowerQuery)) return false;
  }

  // Client-side media filtering (for streaming events only)
  if (options.mediaType !== 'all') {
    const hasImages = hasImageImeta(event);
    const hasVideos = hasVideoImeta(event);
    switch (options.mediaType) {
      case 'images': 
        if (!hasImages || hasVideos) return false;
        break;
      case 'videos': 
        if (!hasVideos) return false;
        break;
      case 'vines': 
        return false; // kind 1 posts aren't vines
      case 'none': 
        if (hasImages || hasVideos) return false;
        break;
    }
  }

  // Note: Language filtering is only done at relay-level (NIP-50 language:)
  // We can't reliably detect language client-side for streaming events

  return true;
}

/**
 * Stream posts using a direct relay connection.
 * When mediaType is 'vines', streams kind 34236 events instead of kind 1.
 * Includes extra kinds the user has enabled in feed settings.
 * Other filters are applied client-side via useMemo.
 */
export function useStreamPosts(query: string, options: StreamPostsOptions) {
  const { nostr } = useNostr();
  const { feedSettings } = useFeedSettings();
  const { muteItems } = useMuteList();
  const [allEvents, setAllEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Vines filter changes the kind queried, so it must restart the stream
  const isVines = options.mediaType === 'vines';

  const enabledKinds = getEnabledFeedKinds(feedSettings);
  const kindsKey = [...enabledKinds].sort().join(',');

  // Stable key for protocols so it can be a useEffect dependency
  const protocolsKey = [...(options.protocols ?? ['nostr'])].sort().join(',');

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    setAllEvents([]);
    setIsLoading(true);

    const eventMap = new Map<string, NostrEvent>();

    function addEvent(event: NostrEvent) {
      if (!alive) return;
      const now = Math.floor(Date.now() / 1000);
      if (event.created_at > now) return;

      // Addressable events (30000-39999) dedupe by pubkey+kind+d
      if (event.kind >= 30000 && event.kind < 40000) {
        const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
        const key = `${event.pubkey}:${event.kind}:${dTag}`;
        const existing = eventMap.get(key);
        if (existing && existing.created_at >= event.created_at) return;
        eventMap.set(key, event);
      } else {
        if (eventMap.has(event.id)) return;
        eventMap.set(event.id, event);
      }

      setAllEvents(Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at));
    }

    // Build the kinds list: either vines-only or user-selected feed kinds (minus reposts)
    const kinds: number[] = isVines
      ? [34236]
      : enabledKinds.filter((k) => !isRepostKind(k));

    // Base filter for streaming (kinds only - no search)
    const streamFilter: NostrFilter = { kinds };

    // Search filter for initial query (includes NIP-50 extensions)
    // protocol:nostr = native Nostr only (no bridged events).
    // When bridged protocols are selected, omit protocol:nostr so the relay
    // returns both native and bridged events matching the selected protocols.
    const protocols = options.protocols ?? ['nostr'];
    const bridged = protocols.filter(p => p !== 'nostr');
    const searchParts: string[] = bridged.length > 0
      ? bridged.map(p => `protocol:${p}`)
      : ['protocol:nostr'];
    
    if (query.trim()) {
      searchParts.push(query.trim());
    }

    // Add language filter (NIP-50 extension supported by Ditto)
    if (options.language && options.language !== 'global') {
      searchParts.push(`language:${options.language}`);
    }

    // Add media filter (NIP-50 extension supported by Ditto)
    // Only apply to non-vines queries (kind 1)
    if (!isVines) {
      if (options.mediaType === 'images') {
        searchParts.push('media:true');
        searchParts.push('video:false');
      } else if (options.mediaType === 'videos') {
        searchParts.push('video:true');
      } else if (options.mediaType === 'none') {
        searchParts.push('media:false');
      }
      // 'all' means no media filter
    }

    const initialFilter: NostrFilter = { ...streamFilter };
    if (searchParts.length > 0) {
      initialFilter.search = searchParts.join(' ');
    }

    // 1. Fetch initial batch with search filters (uses pool, reuses existing connections)
    (async () => {
      try {
        const events = await nostr.query(
          [{ ...initialFilter, limit: 40 }],
          { signal: ac.signal },
        );
        for (const event of events) {
          addEvent(event);
        }
      } catch {
        // abort expected
      }
      if (alive) setIsLoading(false);
    })();

    // 2. Stream new events WITHOUT search (relays don't support streaming search)
    // Client-side filtering is applied via useMemo at the end
    // 
    // CRITICAL: The pool has eoseTimeout: 500 which aborts req() subscriptions 500ms after
    // the first EOSE. This kills streaming! Solution: Use relay() directly for one relay
    // to avoid the pool's timeout logic.
    (async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        
        // Use relay.ditto.pub directly for streaming to avoid pool's eoseTimeout
        const dittoRelay = nostr.relay(DITTO_RELAY);
        
        for await (const msg of dittoRelay.req(
          [{ ...streamFilter, since: now, limit: 0 }],
          { signal: ac.signal }
        )) {
          if (!alive) break;
          
          if (msg[0] === 'EVENT') {
            addEvent(msg[2]);
          } else if (msg[0] === 'CLOSED') {
            break;
          }
        }
      } catch {
        // abort expected
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [nostr, query, isVines, kindsKey, options.language, options.mediaType, protocolsKey]);

  // Apply client-side filters (including mute filtering) without restarting the stream
  const posts = useMemo(() => {
    return allEvents.filter((event) => {
      if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
      return filterEvent(event, options, query);
    });
  }, [allEvents, options.includeReplies, options.mediaType, protocolsKey, query, muteItems]);

  return { posts, isLoading };
}
