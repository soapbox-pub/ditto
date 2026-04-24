import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useFeedSettings } from './useFeedSettings';
import { useMuteList } from './useMuteList';
import { useContentFilters } from './useContentFilters';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { isReplyEvent } from '@/lib/nostrEvents';
import { isEventMuted } from '@/lib/muteHelpers';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { DITTO_RELAYS } from '@/lib/appRelays';
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

  // Filter replies (kind 1 and 1111 only)
  if (event.kind === 1 || event.kind === 1111) {
    if (!options.includeReplies && isReplyEvent(event)) return false;
  }

  // Client-side search — applied to all kinds for streamed events.
  // The initial batch uses relay-level NIP-50 search; streamed events have no
  // search filter at the relay, so we must enforce it here.
  if (searchQuery.trim()) {
    const lowerQuery = searchQuery.toLowerCase();
    const lowerContent = event.content.toLowerCase();
    // For non-text events also check the title/summary/subject tags
    const searchableTags = ['title', 'summary', 'subject', 'alt'];
    const tagText = searchableTags
      .flatMap((name) => event.tags.filter(([t]) => t === name).map(([, v]) => v ?? ''))
      .join(' ')
      .toLowerCase();
    if (!lowerContent.includes(lowerQuery) && !tagText.includes(lowerQuery)) return false;
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

/** Number of events to fetch per page. */
const PAGE_SIZE = 40;

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
  // Buffer for streamed events — held separately until user scrolls back up
  const streamBufferRef = useRef<NostrEvent[]>([]);
  const [streamBufferCount, setStreamBufferCount] = useState(0);
  // Track whether initial batch has loaded
  const initialLoadDoneRef = useRef(false);
  // Track whether user has scrolled away from the top
  const isScrolledRef = useRef(false);
  // IDs of events that were just flushed from the buffer (for highlight animation)
  const [flushedIds, setFlushedIds] = useState<Set<string>>(new Set());
  const flushedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Pagination state
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);
  const oldestTimestampRef = useRef<number | null>(null);

  /** Merge buffered events into the main list and mark them as flushed. */
  const doFlush = useCallback(() => {
    if (streamBufferRef.current.length === 0) return;
    const ids = new Set(streamBufferRef.current.map((e) => e.id));
    setAllEvents((prev) => {
      const merged = [...prev, ...streamBufferRef.current];
      merged.sort((a, b) => b.created_at - a.created_at);
      return merged;
    });
    streamBufferRef.current = [];
    setStreamBufferCount(0);
    // Show highlight briefly then clear
    setFlushedIds(ids);
    clearTimeout(flushedTimerRef.current);
    flushedTimerRef.current = setTimeout(() => setFlushedIds(new Set()), 1500);
  }, []);

  // Clean up timer on unmount
  useEffect(() => () => clearTimeout(flushedTimerRef.current), []);

  // Monitor scroll position — only buffer when user is scrolled down
  useEffect(() => {
    const threshold = 200; // px from top
    function onScroll() {
      isScrolledRef.current = window.scrollY > threshold;
      // Auto-flush when user scrolls back to the top
      if (!isScrolledRef.current && streamBufferRef.current.length > 0) {
        doFlush();
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [doFlush]);

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

  // Build the search filter once — reused by initial fetch and pagination.
  const paginationFilter = useMemo(() => {
    // Build the kinds list based on mediaType (or override entirely)
    let kinds: number[];
    if (options.kindsOverride && options.kindsOverride.length > 0) {
      kinds = [...options.kindsOverride];
    } else if (options.mediaType === 'vines') {
      kinds = [22, 34236];           // shorts + vines
    } else if (options.mediaType === 'videos') {
      kinds = [21, 22, ...enabledKinds.filter((k) => !isRepostKind(k))];
    } else if (options.mediaType === 'images') {
      kinds = [20, ...enabledKinds.filter((k) => !isRepostKind(k))];
    } else {
      kinds = enabledKinds.filter((k) => !isRepostKind(k));
    }
    // Deduplicate
    kinds = [...new Set(kinds)];

    // Base filter (kinds only - no search)
    const streamFilter: NostrFilter = { kinds };

    // Search filter for queries (includes NIP-50 extensions)
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
    }

    const searchFilter: NostrFilter = { ...streamFilter };
    if (searchParts.length > 0) {
      searchFilter.search = searchParts.join(' ');
    }

    // Author filter
    if (resolvedAuthorPubkeys && resolvedAuthorPubkeys.length > 0) {
      searchFilter.authors = resolvedAuthorPubkeys;
      streamFilter.authors = resolvedAuthorPubkeys;
    }

    // Sort preference (NIP-50 extension)
    if (options.sort === 'hot') {
      searchFilter.search = (searchFilter.search ? searchFilter.search + ' ' : '') + 'sort:hot';
    } else if (options.sort === 'trending') {
      searchFilter.search = (searchFilter.search ? searchFilter.search + ' ' : '') + 'sort:trending';
    }

    return { searchFilter, streamFilter };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- enabledKinds is stabilized via kindsKey; options.protocols via protocolsKey; kindsOverride via kindsOverrideKey; authorPubkeys via authorPubkeysKey
  }, [query, isDedicatedKindQuery, kindsKey, options.language, options.mediaType, protocolsKey, kindsOverrideKey, authorPubkeysKey, options.sort]);

  // Shared ref for the event map and known IDs — persists across initial fetch + pagination
  const eventMapRef = useRef(new Map<string, NostrEvent>());
  const knownIdsRef = useRef(new Set<string>());

  const addEvent = useCallback((event: NostrEvent, isStreamed: boolean) => {
    const now = Math.floor(Date.now() / 1000);
    if (event.created_at > now) return;

    // Dedupe key
    let dedupeKey: string;
    if (event.kind >= 30000 && event.kind < 40000) {
      const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
      dedupeKey = `${event.pubkey}:${event.kind}:${dTag}`;
    } else {
      dedupeKey = event.id;
    }

    // Buffer streamed events only when user is scrolled down to avoid scroll jumps.
    if (isStreamed && initialLoadDoneRef.current && isScrolledRef.current) {
      if (knownIdsRef.current.has(dedupeKey)) return;
      knownIdsRef.current.add(dedupeKey);
      streamBufferRef.current = [...streamBufferRef.current, event];
      setStreamBufferCount(streamBufferRef.current.length);
      return;
    }

    // Addressable events (30000-39999) dedupe by pubkey+kind+d
    if (event.kind >= 30000 && event.kind < 40000) {
      const existing = eventMapRef.current.get(dedupeKey);
      if (existing && existing.created_at >= event.created_at) return;
      eventMapRef.current.set(dedupeKey, event);
    } else {
      if (eventMapRef.current.has(dedupeKey)) return;
      eventMapRef.current.set(dedupeKey, event);
    }
    knownIdsRef.current.add(dedupeKey);

    setAllEvents(Array.from(eventMapRef.current.values()).sort((a, b) => b.created_at - a.created_at));
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    // Reset all state on filter change
    setAllEvents([]);
    setIsLoading(true);
    setHasNextPage(true);
    oldestTimestampRef.current = null;
    initialLoadDoneRef.current = false;
    streamBufferRef.current = [];
    setStreamBufferCount(0);
    eventMapRef.current = new Map();
    knownIdsRef.current = new Set();

    const { searchFilter, streamFilter } = paginationFilter;

    // 1. Fetch initial batch with search filters (uses pool, reuses existing connections)
    (async () => {
      try {
        const events = await nostr.query(
          [{ ...searchFilter, limit: PAGE_SIZE }],
          { signal: ac.signal },
        );
        for (const event of events) {
          addEvent(event, false);
        }
        // Track oldest timestamp for pagination
        if (events.length > 0) {
          const oldest = Math.min(...events.map((e) => e.created_at));
          oldestTimestampRef.current = oldest;
        }
        // If we got fewer events than PAGE_SIZE, there's no more to fetch
        if (events.length < PAGE_SIZE) {
          setHasNextPage(false);
        }
      } catch {
        // abort expected
      }
      if (alive) {
        initialLoadDoneRef.current = true;
        setIsLoading(false);
      }
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
        
        // Use Ditto relays directly for streaming to avoid pool's eoseTimeout
        const dittoRelay = nostr.group(DITTO_RELAYS);
        
        for await (const msg of dittoRelay.req(
          [{ ...streamFilter, since: now, limit: 0 }],
          { signal: ac.signal }
        )) {
          if (!alive) break;
          
          if (msg[0] === 'EVENT') {
            addEvent(msg[2], true);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- addEvent is a stable ref-based callback
  }, [nostr, paginationFilter]);

  /** Fetch the next page of older results. */
  const fetchNextPage = useCallback(async () => {
    if (isFetchingNextPage || !hasNextPage || oldestTimestampRef.current === null) return;
    setIsFetchingNextPage(true);
    try {
      const { searchFilter } = paginationFilter;
      const events = await nostr.query(
        [{ ...searchFilter, until: oldestTimestampRef.current - 1, limit: PAGE_SIZE }],
      );
      for (const event of events) {
        addEvent(event, false);
      }
      if (events.length > 0) {
        const oldest = Math.min(...events.map((e) => e.created_at));
        oldestTimestampRef.current = oldest;
      }
      if (events.length < PAGE_SIZE) {
        setHasNextPage(false);
      }
    } catch {
      // query failed — don't break pagination, just stop
      setHasNextPage(false);
    } finally {
      setIsFetchingNextPage(false);
    }
  }, [isFetchingNextPage, hasNextPage, paginationFilter, nostr, addEvent]);

  // Flush buffered streamed events into the main list (called by UI when user wants to see new posts)
  const flushStreamBuffer = doFlush;

  // Shared predicate for client-side filtering (mute, content, search, media, author, etc.)
  const matchesFilters = useCallback((event: NostrEvent) => {
    if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
    if (shouldFilterEvent(event)) return false;
    if (resolvedAuthorPubkeys) {
      const authorSet = new Set(resolvedAuthorPubkeys);
      if (!authorSet.has(event.pubkey)) return false;
    }
    return filterEvent(event, options, query);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- using specific options fields instead of the whole object for granular reactivity
  }, [options.includeReplies, options.mediaType, protocolsKey, query, muteItems, resolvedAuthorPubkeys, shouldFilterEvent, authorPubkeysKey]);

  // Apply client-side filters (including mute filtering and content filters) without restarting the stream
  const posts = useMemo(() => {
    return allEvents.filter(matchesFilters);
  }, [allEvents, matchesFilters]);

  // Count only buffered events that pass the same filters so the "N new posts"
  // pill reflects the actual number the user will see after flushing.
  const filteredNewPostCount = useMemo(() => {
    return streamBufferRef.current.filter(matchesFilters).length;
  // streamBufferCount is used as a dependency to re-evaluate when the buffer changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamBufferCount, matchesFilters]);

  return {
    posts,
    isLoading,
    newPostCount: filteredNewPostCount,
    flushStreamBuffer,
    flushedIds,
    // Pagination
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}
