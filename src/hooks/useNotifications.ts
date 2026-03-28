import { useCallback, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useEncryptedSettings } from './useEncryptedSettings';
import { useFollowList } from './useFollowActions';
import { LETTER_KIND } from '@/lib/letterTypes';

const PAGE_SIZE = 20;

/** All kinds that can appear as notifications. */
const ALL_NOTIFICATION_KINDS = [1, 6, 16, 7, 8, 9735, 1111, 1222, 1244, LETTER_KIND] as const;

export interface NotificationItem {
  /** The notification event (kind 1, 6, 16, 7, 8, 9735, 1111, 1222, 1244, or 8211). */
  event: NostrEvent;
  /** The referenced event (the post that was liked/reposted/zapped), if available. */
  referencedEvent?: NostrEvent;
}

/**
 * A group of notification events that all refer to the same post/content and
 * have the same interaction type (e.g. 5 people liking the same note).
 *
 * When `actors` has more than one entry the UI should condense them into a
 * single row rather than repeating the referenced post card for each actor.
 */
export interface GroupedNotificationItem {
  /**
   * Stable key for React lists.  For multi-actor groups this is
   * `<kind>:<referencedEventId>`.  For standalone items it's the event ID.
   */
  key: string;
  /**
   * The kind that describes this group.
   * 7 = reaction, 6/16 = repost, 9735 = zap, 1 = mention, 1111 = comment.
   */
  kind: number;
  /** All notification events that belong to this group, newest-first. */
  actors: NotificationItem[];
  /**
   * The post/content being acted upon (same for every actor in the group).
   * Undefined for mentions and comments where the event IS the content.
   */
  referencedEvent?: NostrEvent;
  /**
   * True if ANY actor event in this group is newer than the read cursor
   * (i.e. at least one event is unread).
   */
  isNew: boolean;
  /** The timestamp of the newest actor event, used for ordering. */
  newestAt: number;
}

interface NotificationPage {
  items: NotificationItem[];
  /** Oldest event timestamp in this page, used for cursor-based pagination. */
  oldestTimestamp: number;
}

export interface NotificationData {
  /** All notification items (paginated, flattened). */
  items: NotificationItem[];
  /** Grouped / condensed notification items for rendering. */
  groupedItems: GroupedNotificationItem[];
  /** IDs of notifications newer than cursor (unread). */
  newNotificationIds: Set<string>;
  /** Whether there are any unread notifications. */
  hasUnread: boolean;
  /** Mark all current notifications as read. */
  markAsRead: () => Promise<void>;
  /** Loading state for the first page. */
  isLoading: boolean;
  /** Whether the query has completed at least once. */
  hasFetched: boolean;
  /** Whether more pages are available. */
  hasNextPage: boolean;
  /** Whether a next page is currently being fetched. */
  isFetchingNextPage: boolean;
  /** Fetch the next page. */
  fetchNextPage: () => void;
}

/** Get the referenced event ID from an event's tags. */
function getReferencedEventId(event: NostrEvent): string | undefined {
  const eTag = event.tags.findLast(([name]) => name === 'e');
  return eTag?.[1];
}

/**
 * Returns a stable "group key" for a notification item.
 * Events that share the same group key will be condensed into one row.
 *
 * Reactions, reposts, and zaps group by (kind-bucket, referencedEventId).
 * Mentions and comments each stand alone (group key == event id).
 */
function groupKey(item: NotificationItem): string {
  const { event } = item;
  const refId = item.referencedEvent?.id ?? getReferencedEventId(event);

  if ((event.kind === 7 || event.kind === 6 || event.kind === 16 || event.kind === 9735) && refId) {
    // Use a canonical kind bucket so kind-6 and kind-16 reposts merge together
    const bucket = event.kind === 6 || event.kind === 16 ? 'repost' : String(event.kind);
    return `${bucket}:${refId}`;
  }

  // Mentions (kind 1), comments (kind 1111), and letters (8211) are always standalone
  return event.id;
}

/**
 * Build condensed groups from a flat, newest-first list of notification items.
 * Groups preserve the order of the first (newest) item that seeds each group.
 */
function buildGroups(
  items: NotificationItem[],
  newNotificationIds: Set<string>,
): GroupedNotificationItem[] {
  const groupMap = new Map<string, GroupedNotificationItem>();
  const groupOrder: string[] = [];

  for (const item of items) {
    const key = groupKey(item);

    if (!groupMap.has(key)) {
      groupOrder.push(key);
      groupMap.set(key, {
        key,
        kind: item.event.kind,
        actors: [],
        referencedEvent: item.referencedEvent,
        isNew: false,
        newestAt: item.event.created_at,
      });
    }

    const group = groupMap.get(key)!;
    // Skip if this pubkey is already represented in the group
    if (group.actors.some((a) => a.event.pubkey === item.event.pubkey)) continue;
    group.actors.push(item);

    if (newNotificationIds.has(item.event.id)) {
      group.isNew = true;
    }

    // Keep the newest timestamp in sync
    if (item.event.created_at > group.newestAt) {
      group.newestAt = item.event.created_at;
    }

    // If the first actor already had the referenced event, prefer that; otherwise
    // use whichever actor first provided a referencedEvent.
    if (!group.referencedEvent && item.referencedEvent) {
      group.referencedEvent = item.referencedEvent;
    }
  }

  return groupOrder.map((k) => groupMap.get(k)!);
}

/**
 * Derives the set of Nostr kinds to request based on per-type preferences.
 * Kinds default to enabled when the preference is absent.
 */
function getEnabledNotificationKinds(
  prefs: NonNullable<ReturnType<typeof useEncryptedSettings>['settings']>['notificationPreferences'],
): number[] {
  const p = prefs ?? {};
  const kinds: number[] = [];

  if (p.reactions !== false)  kinds.push(7);
  if (p.reposts !== false)    kinds.push(6, 16);
  if (p.zaps !== false)       kinds.push(9735);
  if (p.mentions !== false)   kinds.push(1);
  if (p.comments !== false)   kinds.push(1111, 1222, 1244);
  if (p.badges !== false)     kinds.push(8);
  if (p.letters !== false)    kinds.push(LETTER_KIND);

  // Always fall back to all kinds so the query never sends an empty kinds array
  return kinds.length > 0 ? kinds : [...ALL_NOTIFICATION_KINDS];
}

/**
 * Hook to query notifications with infinite scroll pagination and track unread status.
 * Per-type preferences and the "only from people I follow" filter are applied at
 * query time (relay-level), not client-side.
 */
export function useNotifications(): NotificationData {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { settings, updateSettings } = useEncryptedSettings();
  const { data: followData } = useFollowList();

  const prefs = settings?.notificationPreferences;

  // Derive kinds from per-type prefs — changes cause a new relay query
  const enabledKinds = useMemo(() => getEnabledNotificationKinds(prefs), [prefs]);
  const kindsKey = [...enabledKinds].sort().join(',');

  // Authors filter: when onlyFollowing is set, restrict to followed pubkeys
  const followedPubkeys = useMemo(
    () => followData?.pubkeys ?? [],
    [followData?.pubkeys],
  );
  const onlyFollowing = prefs?.onlyFollowing === true;
  // Only gate on the follow list when it's actually loaded (non-empty or follow list fetch done)
  const authorsFilter = onlyFollowing && followedPubkeys.length > 0
    ? followedPubkeys
    : undefined;
  const authorsKey = authorsFilter ? authorsFilter.slice().sort().join(',') : 'all';

  const infiniteQuery = useInfiniteQuery<NotificationPage, Error>({
    queryKey: ['notifications', user?.pubkey ?? '', kindsKey, authorsKey],
    queryFn: async ({ pageParam, signal }) => {
      if (!user) return { items: [], oldestTimestamp: Math.floor(Date.now() / 1000) };

      const filter: Record<string, unknown> = {
        kinds: enabledKinds,
        '#p': [user.pubkey],
        limit: PAGE_SIZE,
      };
      if (authorsFilter) {
        filter.authors = authorsFilter;
      }
      if (pageParam) {
        filter.until = pageParam;
      }

      const events = await nostr.query(
        [filter as { kinds: number[]; '#p': string[]; limit: number; authors?: string[]; until?: number }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const rawEvents = Array.isArray(events) ? events : [];

      // Filter out own events and sort
      const filtered = rawEvents
        .filter((e) => e.pubkey !== user.pubkey)
        .sort((a, b) => b.created_at - a.created_at);

      // Track oldest timestamp from the raw query for pagination
      const oldestTimestamp = filtered.length > 0
        ? Math.min(...filtered.map((e) => e.created_at))
        : Math.floor(Date.now() / 1000);

      // Collect referenced event IDs for batch fetching
      const referencedIds: string[] = [];
      for (const ev of filtered) {
        // kind 1 (mention), voice messages (1222/1244), and letters (8211) ARE the notification content;
        // kind 1111 (comment) IS the content but we also fetch its parent for context.
        if (ev.kind !== 1 && ev.kind !== 1222 && ev.kind !== 1244 && ev.kind !== LETTER_KIND) {
          const refId = getReferencedEventId(ev);
          if (refId) referencedIds.push(refId);
        }
      }

      // Batch-fetch referenced events in a single query
      const referencedMap = new Map<string, NostrEvent>();
      if (referencedIds.length > 0) {
        // Check query cache first, only fetch IDs we don't have
        const uncachedIds: string[] = [];
        for (const id of referencedIds) {
          const cached = queryClient.getQueryData<NostrEvent | null>(['event', id]);
          if (cached) {
            referencedMap.set(id, cached);
          } else {
            uncachedIds.push(id);
          }
        }

        if (uncachedIds.length > 0) {
          try {
            const refEvents = await nostr.query(
              [{ ids: uncachedIds, limit: uncachedIds.length }],
              { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
            );
            for (const refEv of refEvents) {
              referencedMap.set(refEv.id, refEv);
              // Seed the event cache so NoteCard sub-queries resolve instantly
              if (!queryClient.getQueryData(['event', refEv.id])) {
                queryClient.setQueryData(['event', refEv.id], refEv);
              }
            }
          } catch {
            // Timeout — referenced events will load individually via useEvent
          }
        }
      }

      // Build notification items, filtering out reactions/reposts on posts the
      // user didn't author (i.e. they were only tagged in them).
      const items: NotificationItem[] = filtered.flatMap((ev) => {
        const refId = (ev.kind !== 1 && ev.kind !== 1222 && ev.kind !== 1244 && ev.kind !== LETTER_KIND) ? getReferencedEventId(ev) : undefined;
        const referencedEvent = refId ? referencedMap.get(refId) : undefined;

        // For reactions (7), reposts (6, 16), and zaps (9735), only notify if
        // the referenced post was authored by the current user.
        if (ev.kind === 7 || ev.kind === 6 || ev.kind === 16 || ev.kind === 9735) {
          if (!referencedEvent || referencedEvent.pubkey !== user.pubkey) return [];
        }

        return [{ event: ev, referencedEvent }];
      });

      return { items, oldestTimestamp };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.items.length === 0) return undefined;
      return lastPage.oldestTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: Capacitor.isNativePlatform() ? false : 60_000,
  });

  const {
    data,
    isLoading,
    isFetched,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = infiniteQuery;

  // Flatten and deduplicate across pages
  const items = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    return data.pages.flatMap((page) => page.items).filter((item) => {
      if (seen.has(item.event.id)) return false;
      seen.add(item.event.id);
      return true;
    });
  }, [data?.pages]);

  // Only use cursor if settings have actually loaded, otherwise null
  const remoteCursor = settings !== undefined && settings !== null
    ? (settings.notificationsCursor ?? 0)
    : null;

  // Optimistic local cursor — updated immediately on markAsRead so that
  // newNotificationIds collapses to empty before the query cache catches up,
  // preventing the NotificationsPage effect from re-triggering markAsRead.
  const optimisticCursor = useRef<number | null>(null);
  const notificationsCursor = optimisticCursor.current !== null
    ? Math.max(optimisticCursor.current, remoteCursor ?? 0)
    : remoteCursor;

  // Build set of unread notification IDs
  const newNotificationIds = useMemo(() => {
    if (notificationsCursor === null) return new Set<string>();
    return new Set(
      items
        .filter((item) => item.event.created_at > notificationsCursor)
        .map((item) => item.event.id),
    );
  }, [items, notificationsCursor]);

  const hasUnread = notificationsCursor !== null && newNotificationIds.size > 0;

  // Build grouped items for condensed display
  const groupedItems = useMemo(
    () => buildGroups(items, newNotificationIds),
    [items, newNotificationIds],
  );

  // Mark all current notifications as read by updating the cursor
  const markAsRead = useCallback(async () => {
    if (!user || items.length === 0 || notificationsCursor === null) return;

    const newestTimestamp = Math.max(...items.map((item) => item.event.created_at));

    if (newestTimestamp <= notificationsCursor) return;

    // Update optimistic cursor immediately so unread state clears before
    // the query cache updates, preventing re-trigger loops.
    optimisticCursor.current = newestTimestamp;

    try {
      await updateSettings.mutateAsync({
        notificationsCursor: newestTimestamp,
      });
      // Immediately clear the nav dot
      queryClient.setQueryData(['notifications-unread', user.pubkey], false);
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', user.pubkey] });
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
      optimisticCursor.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey, items.length, notificationsCursor]);

  return {
    items,
    groupedItems,
    newNotificationIds,
    hasUnread,
    markAsRead,
    isLoading,
    hasFetched: isFetched,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    fetchNextPage,
  };
}
