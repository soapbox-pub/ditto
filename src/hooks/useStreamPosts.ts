import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo } from 'react';
import { useFeedSettings } from './useFeedSettings';
import { useMuteList } from './useMuteList';
import { useContentFilters } from './useContentFilters';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { isReplyEvent } from '@/lib/nostrEvents';
import { isEventMuted } from '@/lib/muteHelpers';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { DITTO_RELAY } from '@/lib/appRelays';
import { nip19 } from 'nostr-tools';

interface StreamPostsOptions {
  includeReplies: boolean;
  mediaType: 'all' | 'images' | 'videos' | 'vines' | 'none';
  language?: string;
  /** Protocol strings to pass as protocol: search terms. Defaults to ['nostr']. */
  protocols?: string[];
  /**
   * When set, overrides the automatic kind selection entirely.
   * The search will only query these specific kind numbers.
   */
  kindsOverride?: number[];
  /**
   * When set, limits results to events authored by these pubkeys.
   * Each entry accepts raw hex or npub-encoded pubkeys.
   */
  authorPubkeys?: string[];
  /** NIP-50 sort preference. 'recent' = default (no sort: term). */
  sort?: 'recent' | 'hot' | 'trending';
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
function filterEvent(
  event: NostrEvent,
  options: StreamPostsOptions,
  searchQuery: string,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (event.created_at > now) return false;

  // Protocol filter — streaming events carry a 'proxy' tag for bridged protocols.
  // A missing proxy tag = native Nostr. Filter based on selected protocol.
  const protocols = options.protocols ?? ['nostr'];
  if (!protocols.includes('nostr') || protocols.length > 1) {
    const proxyTag = event.tags.find(([name]) => name === 'proxy');
    if (protocols.includes('nostr') && !protocols.some(p => p !== 'nostr')) {
      // nostr only: reject events with a proxy tag
      if (proxyTag) return false;
    } else {
      // bridged protocol selected: only keep events that have a matching proxy tag
      // and optionally native nostr events if 'nostr' is also in protocols
      const hasProxy = !!proxyTag;
      const isNative = !hasProxy;
      if (isNative && !protocols.includes('nostr')) return false;
      if (hasProxy) {
        // proxy tag format: ['proxy', '<uri>', '<protocol>']
        const proxyProtocol = proxyTag?.[2]?.toLowerCase();
        const wantedBridged = protocols.filter(p => p !== 'nostr');
        if (!wantedBridged.some(p => proxyProtocol?.includes(p))) return false;
      }
    }
  }

  // Non-text events (extra kinds) pass through without further content filtering
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
        // Vines are kinds 22/34236; kind 1 posts aren't vines — filter them out
        // (streaming for vines uses kind 22/34236 in streamFilter, so kind 1 events
        // that slip through from cache should be rejected)
        if (event.kind === 1 || event.kind === 1111) return false;
        break;
      case 'none':
        if (hasImages || hasVideos) return false;
        break;
    }
  }

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
  const { shouldFilterEvent } = useContentFilters();
  const [allEvents, setAllEvents] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Resolve authorPubkeys: accept hex or npub-encoded entries
  const resolvedAuthorPubkeys = useMemo(() => {
    if (!options.authorPubkeys || options.authorPubkeys.length === 0) return undefined;
    const resolved: string[] = [];
    for (const raw of options.authorPubkeys) {
      const t = raw.trim();
      if (/^[0-9a-f]{64}$/i.test(t)) {
        resolved.push(t);
      } else {
        try {
          const decoded = nip19.decode(t);
          if (decoded.type === 'npub') resolved.push(decoded.data);
        } catch { /* ignore */ }
      }
    }
    return resolved.length > 0 ? resolved : undefined;
  }, [options.authorPubkeys]);

  // These mediaTypes query dedicated event kinds rather than filtering kind 1
  const isDedicatedKindQuery = !options.kindsOverride && (options.mediaType === 'vines' || options.mediaType === 'images' || options.mediaType === 'videos');

  const enabledKinds = getEnabledFeedKinds(feedSettings);
  const kindsKey = [...enabledKinds].sort().join(',');

  // Stable key for protocols so it can be a useEffect dependency
  const protocolsKey = [...(options.protocols ?? ['nostr'])].sort().join(',');

  // Stable key for kindsOverride
  const kindsOverrideKey = options.kindsOverride ? [...options.kindsOverride].sort().join(',') : '';

  // Stable key for authorPubkeys (follows list)
  const authorPubkeysKey = options.authorPubkeys ? [...options.authorPubkeys].sort().join(',') : '';

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

    // Build the kinds list based on mediaType (or override entirely)
    let kinds: number[];
    if (options.kindsOverride && options.kindsOverride.length > 0) {
      kinds = [...options.kindsOverride];
    } else if (options.mediaType === 'vines') {
      kinds = [22, 34236];           // shorts + vines
    } else if (options.mediaType === 'videos') {
      kinds = [1, 21, 22, ...enabledKinds.filter((k) => !isRepostKind(k))];
    } else if (options.mediaType === 'images') {
      kinds = [1, 20, ...enabledKinds.filter((k) => !isRepostKind(k))];
    } else {
      kinds = [1, ...enabledKinds.filter((k) => !isRepostKind(k))];
    }
    // Deduplicate
    kinds = [...new Set(kinds)];

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
    // Skip for dedicated-kind queries — kind selection already scopes them
    if (!isDedicatedKindQuery) {
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

    // Author filter — scopes both the initial batch and streaming subscription.
    if (resolvedAuthorPubkeys && resolvedAuthorPubkeys.length > 0) {
      initialFilter.authors = resolvedAuthorPubkeys;
      streamFilter.authors = resolvedAuthorPubkeys;
    }

    // Sort preference (NIP-50 extension)
    if (options.sort === 'hot') {
      searchParts.push('sort:hot');
    } else if (options.sort === 'trending') {
      searchParts.push('sort:trending');
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- enabledKinds is stabilized via kindsKey; options.protocols is stabilized via protocolsKey; kindsOverride is stabilized via kindsOverrideKey; authorPubkeys is stabilized via authorPubkeysKey
  }, [nostr, query, isDedicatedKindQuery, kindsKey, options.language, options.mediaType, protocolsKey, kindsOverrideKey, authorPubkeysKey, options.sort]);

  // Apply client-side filters (including mute filtering and content filters) without restarting the stream
  const posts = useMemo(() => {
    const authorSet = resolvedAuthorPubkeys ? new Set(resolvedAuthorPubkeys) : undefined;
    return allEvents.filter((event) => {
      if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
      if (shouldFilterEvent(event)) return false;
      // Client-side author filter for streaming events (relay filter handles initial batch)
      if (authorSet && !authorSet.has(event.pubkey)) return false;
      return filterEvent(event, options, query);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- using specific options fields instead of the whole object for granular reactivity
  }, [allEvents, options.includeReplies, options.mediaType, protocolsKey, query, muteItems, resolvedAuthorPubkeys, shouldFilterEvent, authorPubkeysKey]);

  return { posts, isLoading };
}
