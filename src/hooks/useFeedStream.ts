import { useNostr } from '@nostrify/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppContext } from './useAppContext';
import { useCurrentUser } from './useCurrentUser';
import { useFeedSettings } from './useFeedSettings';
import { useContentFilters } from './useContentFilters';
import { useMutedAuthorFilter } from './useMutedAuthorFilter';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isReactionKind, isRepostKind, isZapKind, shouldHideFeedEvent } from '@/lib/feedUtils';
import { isReplyEvent } from '@/lib/nostrEvents';
import { APP_RELAYS, getEffectiveRelays } from '@/lib/appRelays';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

/** How far (px) the user must scroll down before new posts start buffering. */
const SCROLL_THRESHOLD = 200;

/** Cap on relays to subscribe to, matching the inbox-relay fan-out cap. */
const MAX_STREAM_RELAYS = 10;

/** Which core feed tabs support live auto-refresh. */
type StreamableTab = 'follows' | 'loved' | 'global' | 'communities';

interface UseFeedStreamOptions {
  /** The active core feed tab. */
  tab: StreamableTab;
  /** Pubkeys whose posts the feed shows (follows tab + own pubkey, loved, or community members). Omit for global. */
  authors?: string[];
  /** Override the kinds list instead of using feed settings (kind-specific pages). */
  kinds?: number[];
  /** Whether the feed currently shows replies — when false, replies are excluded from the count. */
  showReplies: boolean;
  /** Disable the stream entirely (e.g. while the underlying feed query is gated). */
  enabled?: boolean;
}

/**
 * Detect new posts arriving on the active feed in real time and report how many
 * are waiting, without re-sorting the feed under the user's scroll position.
 *
 * Mirrors the proven streaming pattern from {@link useStreamPosts} (Search page):
 * opens a `since: now` subscription directly on the feed's effective relays —
 * bypassing the pool's `eoseTimeout` so the subscription stays open — and counts
 * events that pass the *same* filters {@link Feed} applies before rendering
 * (mute, content filters, feed-level hide rules, and the reply toggle). Keeping
 * the predicate in sync with the feed is what makes the count match what the
 * user actually sees after refreshing.
 *
 * It deliberately does NOT merge events into the feed. The caller renders a
 * "N new posts" pill; tapping it refreshes the feed query and scrolls to top
 * (see {@link Feed}). New posts are only counted while the user is scrolled down,
 * so a pill never appears over content the user is already at the top of.
 *
 * @returns `newPostCount` (waiting posts) and `reset()` to clear the counter
 *          (call after flushing/refreshing).
 */
export function useFeedStream(options: UseFeedStreamOptions): {
  newPostCount: number;
  reset: () => void;
} {
  const { tab, authors, kinds, showReplies, enabled = true } = options;
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { feedSettings } = useFeedSettings();
  const { mutedPubkeys } = useMutedAuthorFilter();
  const { shouldFilterEvent } = useContentFilters();

  const [newPostCount, setNewPostCount] = useState(0);

  // IDs already counted, so reconnects / duplicate relays don't double-count.
  // (NPool dedupes only the last 1000 ids per subscription, so we track our own.)
  const seenRef = useRef<Set<string>>(new Set());
  // Whether the user is scrolled away from the top. New posts only count while
  // scrolled down — at the top they'd already be visible after a refresh.
  const isScrolledRef = useRef(false);

  const reset = useCallback(() => {
    seenRef.current = new Set();
    setNewPostCount(0);
  }, []);

  // Track scroll position. Reset the counter when the user returns to the top.
  useEffect(() => {
    function onScroll() {
      const scrolled = window.scrollY > SCROLL_THRESHOLD;
      isScrolledRef.current = scrolled;
      if (!scrolled) reset();
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [reset]);

  // Reposts / reactions / zaps are wrapper events; the global feed excludes them
  // and they shouldn't drive the "new posts" count anywhere — count the targets.
  const baseKinds = kinds ?? getEnabledFeedKinds(feedSettings);
  const streamKinds = baseKinds.filter(
    (k) => !isRepostKind(k) && !isReactionKind(k) && !isZapKind(k),
  );
  const kindsKey = [...streamKinds].sort().join(',');
  const authorsKey = authors ? [...authors].sort().join(',') : '';

  // Relays the feed effectively reads from, capped to a sane fan-out. Matches
  // the pool the home feed queries (app relays by default; user relays when
  // opted in) so stream coverage lines up with pull-to-refresh.
  const relayUrls = useMemo(() => {
    const effective = getEffectiveRelays(
      config.relayMetadata,
      config.useAppRelays,
      config.useUserRelays,
    ).relays
      .filter((r) => r.read)
      .map((r) => r.url);
    const urls = effective.length > 0
      ? effective
      : APP_RELAYS.relays.filter((r) => r.read).map((r) => r.url);
    return urls.slice(0, MAX_STREAM_RELAYS);
  }, [config.relayMetadata, config.useAppRelays, config.useUserRelays]);
  const relaysKey = relayUrls.join(',');

  // Keep the latest filter predicate inputs in a ref so the stream's event
  // handler always uses current values without resubscribing when they change
  // (e.g. toggling a content filter or muting someone mid-session).
  const filterStateRef = useRef({ showReplies, mutedPubkeys, shouldFilterEvent, userPubkey: user?.pubkey });
  filterStateRef.current = { showReplies, mutedPubkeys, shouldFilterEvent, userPubkey: user?.pubkey };

  useEffect(() => {
    if (!enabled || streamKinds.length === 0 || relayUrls.length === 0) return;
    // Author-scoped tabs (follows / loved / communities) need a non-empty
    // authors list — an empty array would match everyone.
    if (tab !== 'global' && (!authors || authors.length === 0)) return;

    const ac = new AbortController();
    let alive = true;
    // Reset on (re)subscribe so a tab switch starts the count fresh.
    seenRef.current = new Set();
    setNewPostCount(0);

    const now = Math.floor(Date.now() / 1000);
    const filter: NostrFilter = { kinds: streamKinds, since: now, limit: 0 };
    if (tab !== 'global' && authors && authors.length > 0) {
      filter.authors = authors;
    }

    (async () => {
      try {
        // Subscribe via a relay group directly to avoid the pool's eoseTimeout,
        // which would otherwise close the subscription shortly after EOSE.
        const relay = nostr.group(relayUrls);
        for await (const msg of relay.req([filter], { signal: ac.signal })) {
          if (!alive) break;
          if (msg[0] === 'EVENT') {
            countEvent(msg[2]);
          } else if (msg[0] === 'CLOSED') {
            break;
          }
        }
      } catch {
        // Abort or transient relay error — expected on cleanup / tab switch.
      }
    })();

    function countEvent(event: NostrEvent) {
      // Only buffer while scrolled down; at the top a refresh shows them anyway.
      if (!isScrolledRef.current) return;
      // Guard against clock-skewed future events.
      if (event.created_at > Math.floor(Date.now() / 1000)) return;
      if (seenRef.current.has(event.id)) return;

      const { showReplies: replies, mutedPubkeys: muted, shouldFilterEvent: filterEvent, userPubkey } =
        filterStateRef.current;

      // Don't count the user's own posts — they already know about those.
      if (userPubkey && event.pubkey === userPubkey) return;
      // Mute filter (defense in depth — the authors filter already excludes
      // muted follows, but the global feed has no authors filter).
      if (muted.has(event.pubkey)) return;
      // Apply the same filters the feed runs before rendering so the count
      // matches what the user will actually see after refreshing:
      //   - feed-level hide rules (blank/invalid kinds, deprecated lists, …)
      //   - user content filters
      //   - the reply toggle (feed excludes replies across all kinds when off)
      if (shouldHideFeedEvent(event)) return;
      if (filterEvent(event)) return;
      if (!replies && isReplyEvent(event)) return;

      seenRef.current.add(event.id);
      setNewPostCount((c) => c + 1);
    }

    return () => {
      alive = false;
      ac.abort();
    };
    // streamKinds / authors / relayUrls are stabilized via their *Key deps;
    // filter predicate inputs are read live from filterStateRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nostr, tab, authorsKey, kindsKey, relaysKey, enabled]);

  return { newPostCount, reset };
}
