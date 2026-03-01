import { useCallback, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useEncryptedSettings } from './useEncryptedSettings';

const PAGE_SIZE = 20;

export interface NotificationItem {
  /** The notification event (kind 1, 6, 16, 7, or 9735). */
  event: NostrEvent;
  /** The referenced event (the post that was liked/reposted/zapped), if available. */
  referencedEvent?: NostrEvent;
}

interface NotificationPage {
  items: NotificationItem[];
  /** Oldest event timestamp in this page, used for cursor-based pagination. */
  oldestTimestamp: number;
}

export interface NotificationData {
  /** All notification items (paginated, flattened). */
  items: NotificationItem[];
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
  const eTag = event.tags.find(([name]) => name === 'e');
  return eTag?.[1];
}

/**
 * Hook to query notifications with infinite scroll pagination and track unread status.
 * Uses encrypted settings to persist the last-viewed timestamp.
 */
export function useNotifications(): NotificationData {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { settings, updateSettings } = useEncryptedSettings();

  const infiniteQuery = useInfiniteQuery<NotificationPage, Error>({
    queryKey: ['notifications', user?.pubkey ?? ''],
    queryFn: async ({ pageParam, signal }) => {
      if (!user) return { items: [], oldestTimestamp: Math.floor(Date.now() / 1000) };

      const filter: Record<string, unknown> = {
        kinds: [1, 6, 16, 7, 9735],
        '#p': [user.pubkey],
        limit: PAGE_SIZE,
      };
      if (pageParam) {
        filter.until = pageParam;
      }

      const events = await nostr.query(
        [filter as { kinds: number[]; '#p': string[]; limit: number; until?: number }],
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
        // kind 1 (mention) IS the notification content; no referenced event needed
        if (ev.kind !== 1) {
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

      // Build notification items
      const items: NotificationItem[] = filtered.map((ev) => {
        const refId = ev.kind !== 1 ? getReferencedEventId(ev) : undefined;
        return {
          event: ev,
          referencedEvent: refId ? referencedMap.get(refId) : undefined,
        };
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
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', user.pubkey] });
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
      // Roll back optimistic cursor on failure
      optimisticCursor.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey, items.length, notificationsCursor]);

  return {
    items,
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
