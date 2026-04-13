import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useFeedSettings } from './useFeedSettings';
import { useCurrentUser } from './useCurrentUser';
import { useFollowList } from './useFollowActions';
import { useMuteList } from './useMuteList';
import { useContentFilters } from './useContentFilters';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { isReplyEvent } from '@/lib/nostrEvents';
import { isEventMuted } from '@/lib/muteHelpers';
import { resolveSpell } from '@/lib/spellEngine';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { DITTO_RELAYS } from '@/lib/appRelays';
import { nip19 } from 'nostr-tools';

export interface StreamPostsOptions {
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
  /**
   * When set, drives the entire stream from a kind:777 spell event.
   * The spell is resolved internally (variables, timestamps, hints).
   * All other options on this interface are ignored when spell is set.
   */
  spell?: NostrEvent;
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

/**
 * Stream posts using a direct relay connection.
 * When mediaType is 'vines', streams kind 34236 events instead of kind 1.
 * Includes extra kinds the user has enabled in feed settings.
 * Other filters are applied client-side via useMemo.
 */
export function useStreamPosts(query: string, options: StreamPostsOptions) {
  const { nostr } = useNostr();
  const { feedSettings } = useFeedSettings();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const { muteItems } = useMuteList();
  const { shouldFilterEvent } = useContentFilters();

  // ── Spell resolution ────────────────────────────────────────────────
  // When a spell is provided, resolve it and derive effective options.
  // All other option fields are ignored in spell mode.
  const resolved = useMemo(() => {
    if (!options.spell) return null;
    try {
      const contactPubkeys = followData?.pubkeys ?? [];
      return resolveSpell(options.spell, user?.pubkey, contactPubkeys);
    } catch {
      return null;
    }
  }, [options.spell, user?.pubkey, followData?.pubkeys]);

  // Derive effective options: spell-resolved values take priority
  const effectiveQuery = resolved ? (resolved.filter.search ?? '') : query;
  const effectiveOptions: StreamPostsOptions = useMemo(() => {
    if (!resolved) return options;
    const h = resolved.hints;
    return {
      includeReplies: h.includeReplies,
      mediaType: h.mediaType,
      language: h.language,
      protocols: [h.platform],
      kindsOverride: resolved.filter.kinds,
      authorPubkeys: resolved.filter.authors,
      sort: h.sort,
    };
  }, [resolved, options]);

  // Whether the initial query should be routed exclusively to Ditto relays.
  // True when NIP-50 extensions are used that only Ditto relays understand
  // (sort:hot, language:en, protocol:activitypub, media filters).
  // Applies to both spell-driven and direct option-driven queries.
  const useDittoOnly = resolved?.needsDittoRelay ?? !!(
    (effectiveOptions.sort && effectiveOptions.sort !== 'recent')
    || (effectiveOptions.language && effectiveOptions.language !== 'global')
    || (effectiveOptions.protocols && effectiveOptions.protocols.some(p => p !== 'nostr'))
  );

  // Extra filter fields from the spell (since, until, limit, tag filters)
  const spellExtraFilter: Partial<NostrFilter> | undefined = useMemo(() => {
    if (!resolved) return undefined;
    const extra: Record<string, unknown> = {};
    if (resolved.filter.since !== undefined) extra.since = resolved.filter.since;
    if (resolved.filter.until !== undefined) extra.until = resolved.filter.until;
    if (resolved.filter.limit !== undefined) extra.limit = resolved.filter.limit;
    // Copy tag filters (#t, #e, #p, etc.)
    for (const [key, val] of Object.entries(resolved.filter)) {
      if (key.startsWith('#')) extra[key] = val;
    }
    return Object.keys(extra).length > 0 ? extra as Partial<NostrFilter> : undefined;
  }, [resolved]);

  // Stable key for the spell so the effect restarts when the spell changes
  const spellKey = options.spell?.id ?? '';

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

  // Pagination state for "load more" (infinite scroll)
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Stash the filter + store used by the initial query so loadMore can reuse it
  const paginationRef = useRef<{
    filter: NostrFilter;
    store: { query: (filters: NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]> };
    knownIds: Set<string>;
    eventMap: Map<string, NostrEvent>;
  } | null>(null);

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

  /** Fetch the next page of older events (cursor-based pagination). */
  const loadMore = useCallback(async () => {
    const ctx = paginationRef.current;
    if (!ctx || isLoadingMore || !hasMore) return;

    // Find the oldest event timestamp for the cursor
    const oldest = allEvents.length > 0
      ? Math.min(...allEvents.map((e) => e.created_at))
      : undefined;
    if (oldest === undefined) return;

    setIsLoadingMore(true);
    try {
      const PAGE_SIZE = ctx.filter.limit ?? 40;
      const events = await ctx.store.query(
        [{ ...ctx.filter, until: oldest - 1, limit: PAGE_SIZE }],
        { signal: AbortSignal.timeout(8000) },
      );

      if (events.length < PAGE_SIZE) {
        setHasMore(false);
      }

      if (events.length > 0) {
        const now = Math.floor(Date.now() / 1000);
        setAllEvents((prev) => {
          const merged = [...prev];
          for (const event of events) {
            if (event.created_at > now) continue;

            let dedupeKey: string;
            if (event.kind >= 30000 && event.kind < 40000) {
              const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
              dedupeKey = `${event.pubkey}:${event.kind}:${dTag}`;
            } else {
              dedupeKey = event.id;
            }

            if (ctx.knownIds.has(dedupeKey)) continue;
            ctx.knownIds.add(dedupeKey);
            ctx.eventMap.set(dedupeKey, event);
            merged.push(event);
          }
          return merged.sort((a, b) => b.created_at - a.created_at);
        });
      }
    } catch {
      // timeout — don't break the UI
    } finally {
      setIsLoadingMore(false);
    }
  }, [allEvents, isLoadingMore, hasMore]);

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
    if (!effectiveOptions.authorPubkeys || effectiveOptions.authorPubkeys.length === 0) return undefined;
    const res: string[] = [];
    for (const raw of effectiveOptions.authorPubkeys) {
      const t = raw.trim();
      if (/^[0-9a-f]{64}$/i.test(t)) {
        res.push(t);
      } else {
        try {
          const decoded = nip19.decode(t);
          if (decoded.type === 'npub') res.push(decoded.data);
        } catch { /* ignore */ }
      }
    }
    return res.length > 0 ? res : undefined;
  }, [effectiveOptions.authorPubkeys]);

  // These mediaTypes query dedicated event kinds rather than filtering kind 1
  const isDedicatedKindQuery = !effectiveOptions.kindsOverride && (effectiveOptions.mediaType === 'vines' || effectiveOptions.mediaType === 'images' || effectiveOptions.mediaType === 'videos');

  const enabledKinds = getEnabledFeedKinds(feedSettings);
  const kindsKey = [...enabledKinds].sort().join(',');

  // Stable key for protocols so it can be a useEffect dependency
  const protocolsKey = [...(effectiveOptions.protocols ?? ['nostr'])].sort().join(',');

  // Stable key for kindsOverride
  const kindsOverrideKey = effectiveOptions.kindsOverride ? [...effectiveOptions.kindsOverride].sort().join(',') : '';

  // Stable key for authorPubkeys (follows list)
  const authorPubkeysKey = effectiveOptions.authorPubkeys ? [...effectiveOptions.authorPubkeys].sort().join(',') : '';

  // Stable key for spell extra filter
  const spellExtraFilterKey = spellExtraFilter ? JSON.stringify(spellExtraFilter) : '';

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    setAllEvents([]);
    setIsLoading(true);
    setHasMore(true);
    setIsLoadingMore(false);
    initialLoadDoneRef.current = false;
    paginationRef.current = null;
    streamBufferRef.current = [];
    setStreamBufferCount(0);

    const eventMap = new Map<string, NostrEvent>();
    // Track IDs already in the initial batch to avoid dupes in the buffer
    const knownIds = new Set<string>();

    function addEvent(event: NostrEvent, isStreamed: boolean) {
      if (!alive) return;
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
      // If at the top, merge immediately (natural top-insertion behavior).
      if (isStreamed && initialLoadDoneRef.current && isScrolledRef.current) {
        if (knownIds.has(dedupeKey)) return;
        knownIds.add(dedupeKey);
        streamBufferRef.current = [...streamBufferRef.current, event];
        setStreamBufferCount(streamBufferRef.current.length);
        return;
      }

      // Addressable events (30000-39999) dedupe by pubkey+kind+d
      if (event.kind >= 30000 && event.kind < 40000) {
        const existing = eventMap.get(dedupeKey);
        if (existing && existing.created_at >= event.created_at) return;
        eventMap.set(dedupeKey, event);
      } else {
        if (eventMap.has(dedupeKey)) return;
        eventMap.set(dedupeKey, event);
      }
      knownIds.add(dedupeKey);

      setAllEvents(Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at));
    }

    // Build the kinds list based on mediaType (or override entirely)
    let kinds: number[];
    if (effectiveOptions.kindsOverride && effectiveOptions.kindsOverride.length > 0) {
      kinds = [...effectiveOptions.kindsOverride];
    } else if (effectiveOptions.mediaType === 'vines') {
      kinds = [22, 34236];           // shorts + vines
    } else if (effectiveOptions.mediaType === 'videos') {
      kinds = [21, 22, ...enabledKinds.filter((k) => !isRepostKind(k))];
    } else if (effectiveOptions.mediaType === 'images') {
      kinds = [20, ...enabledKinds.filter((k) => !isRepostKind(k))];
    } else {
      kinds = enabledKinds.filter((k) => !isRepostKind(k));
    }
    // Deduplicate
    kinds = [...new Set(kinds)];

    // Base filter for streaming (kinds only - no search)
    const streamFilter: NostrFilter = { kinds };

    // Search filter for initial query (includes NIP-50 extensions)
    // protocol:nostr = native Nostr only (no bridged events).
    // When bridged protocols are selected, omit protocol:nostr so the relay
    // returns both native and bridged events matching the selected protocols.
    // When the caller doesn't explicitly pass protocols (e.g. Feeds/Packs tabs
    // that query Nostr-native kinds only), skip the protocol term entirely so
    // the relay doesn't filter through NIP-50 search for kinds it may not index.
    const protocols = effectiveOptions.protocols ?? ['nostr'];
    const bridged = protocols.filter(p => p !== 'nostr');
    const searchParts: string[] = bridged.length > 0
      ? bridged.map(p => `protocol:${p}`)
      : effectiveOptions.protocols
        ? ['protocol:nostr']
        : [];
    
    if (effectiveQuery.trim()) {
      searchParts.push(effectiveQuery.trim());
    }

    // Add language filter (NIP-50 extension supported by Ditto)
    if (effectiveOptions.language && effectiveOptions.language !== 'global') {
      searchParts.push(`language:${effectiveOptions.language}`);
    }

    // Add media filter (NIP-50 extension supported by Ditto)
    // Skip for dedicated-kind queries — kind selection already scopes them
    if (!isDedicatedKindQuery) {
      if (effectiveOptions.mediaType === 'images') {
        searchParts.push('media:true');
        searchParts.push('video:false');
      } else if (effectiveOptions.mediaType === 'videos') {
        searchParts.push('video:true');
      } else if (effectiveOptions.mediaType === 'none') {
        searchParts.push('media:false');
      }
      // 'all' means no media filter
    }

    // Sort preference (NIP-50 extension)
    if (effectiveOptions.sort === 'hot') {
      searchParts.push('sort:hot');
    } else if (effectiveOptions.sort === 'trending') {
      searchParts.push('sort:trending');
    }

    const initialFilter: NostrFilter = { ...streamFilter };
    if (searchParts.length > 0) {
      initialFilter.search = searchParts.join(' ');
    }

    // Merge spell-specific filter fields (since, until, limit, tag filters)
    if (spellExtraFilter) {
      Object.assign(initialFilter, spellExtraFilter);
      // Also apply tag filters and author scope to the stream filter
      for (const [key, val] of Object.entries(spellExtraFilter)) {
        if (key.startsWith('#')) {
          (streamFilter as Record<string, unknown>)[key] = val;
        }
      }
    }

    // Author filter — scopes both the initial batch and streaming subscription.
    if (resolvedAuthorPubkeys && resolvedAuthorPubkeys.length > 0) {
      initialFilter.authors = resolvedAuthorPubkeys;
      streamFilter.authors = resolvedAuthorPubkeys;
    }

    // Determine relay routing for the initial query.
    // Ditto relays are required when the NIP-50 search string contains
    // extensions like `language:`, `protocol:`, `media:`, or `sort:` that
    // standard relays don't support. When the query has none of these
    // extensions the user's own relays are appropriate.
    const initialStore = useDittoOnly ? nostr.group(DITTO_RELAYS) : nostr;

    // Stash for loadMore pagination
    paginationRef.current = { filter: initialFilter, store: initialStore, knownIds, eventMap };

    const PAGE_SIZE = initialFilter.limit ?? 40;

    // 1. Fetch initial batch with search filters
    async function fetchInitialBatch() {
      try {
        const events = await initialStore.query(
          [{ ...initialFilter, limit: PAGE_SIZE }],
          { signal: ac.signal },
        );
        for (const event of events) {
          addEvent(event, false);
        }
        if (alive && events.length < PAGE_SIZE) {
          setHasMore(false);
        }
      } catch {
        // abort expected
      }
      if (alive) {
        initialLoadDoneRef.current = true;
        setIsLoading(false);
      }
    }

    // 2. Stream new events WITHOUT search (relays don't support streaming search)
    // Client-side filtering is applied via useMemo at the end
    //
    // CRITICAL: The pool has eoseTimeout: 500 which aborts req() subscriptions 500ms after
    // the first EOSE. This kills streaming! Solution: Use relay() directly for one relay
    // to avoid the pool's timeout logic.
    async function startStreaming() {
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
    }

    fetchInitialBatch();
    startStreaming();

    return () => {
      alive = false;
      ac.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- enabledKinds is stabilized via kindsKey; effectiveOptions fields are stabilized via their respective keys; spellExtraFilter is stabilized via spellExtraFilterKey
  }, [nostr, effectiveQuery, isDedicatedKindQuery, kindsKey, effectiveOptions.language, effectiveOptions.mediaType, protocolsKey, kindsOverrideKey, authorPubkeysKey, effectiveOptions.sort, useDittoOnly, spellExtraFilterKey, spellKey]);

  // Flush buffered streamed events into the main list (called by UI when user wants to see new posts)
  const flushStreamBuffer = doFlush;

  // Pre-compute author set outside the per-event callback
  const authorSet = useMemo(() => resolvedAuthorPubkeys ? new Set(resolvedAuthorPubkeys) : null, [resolvedAuthorPubkeys]);

  // Shared predicate for client-side filtering (mute, content, search, media, author, etc.)
  const matchesFilters = useCallback((event: NostrEvent) => {
    if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
    if (shouldFilterEvent(event)) return false;
    if (authorSet && !authorSet.has(event.pubkey)) return false;
    return filterEvent(event, effectiveOptions, effectiveQuery);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- using specific option fields and stabilized keys for granular reactivity
  }, [effectiveOptions.includeReplies, effectiveOptions.mediaType, protocolsKey, effectiveQuery, muteItems, authorSet, shouldFilterEvent, authorPubkeysKey]);

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

  return { posts, isLoading, newPostCount: filteredNewPostCount, flushStreamBuffer, flushedIds, loadMore, hasMore, isLoadingMore };
}
