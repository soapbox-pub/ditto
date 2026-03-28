import { useEffect, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';

import { useCurrentUser } from './useCurrentUser';
import { useEncryptedSettings } from './useEncryptedSettings';
import { useFollowList } from './useFollowActions';
import { getEnabledNotificationKinds } from '@/lib/notificationKinds';

/** All kinds that can appear as notifications. */
const NOTIFICATION_KINDS = [1, 6, 16, 7, 9735, 1111, 1222, 1244] as const;

/**
 * Lightweight hook that checks whether the user has any unread notifications.
 * Fetches at most 1 event (using `since` to filter at the relay level),
 * making it much cheaper than loading the full notification list.
 *
 * Respects the user's per-type notification preferences so that disabled
 * types (e.g. reactions) don't trigger the unread dot.
 *
 * Also opens a real-time subscription so the unread dot appears immediately
 * when a new notification arrives, instead of waiting for the next poll.
 *
 * Use this in navigation components (sidebar, mobile bottom nav) for the dot indicator.
 * Use `useNotifications` on the actual notifications page where the full list is needed.
 */
export function useHasUnreadNotifications(): boolean {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { settings } = useEncryptedSettings();

  // Only use cursor if settings have actually loaded, otherwise null
  const notificationsCursor = settings !== undefined && settings !== null
    ? (settings.notificationsCursor ?? 0)
    : null;

  const { data: followData } = useFollowList();

  const prefs = settings?.notificationPreferences;

  // Derive enabled kinds from preferences so disabled types don't trigger the dot
  const enabledKinds = useMemo(
    () => getEnabledNotificationKinds(prefs),
    [prefs],
  );
  const kindsKey = [...enabledKinds].sort().join(',');

  // Authors filter: when onlyFollowing is set, restrict to followed pubkeys
  const followedPubkeys = useMemo(
    () => followData?.pubkeys ?? [],
    [followData?.pubkeys],
  );
  const onlyFollowing = prefs?.onlyFollowing === true;
  const authorsFilter = onlyFollowing && followedPubkeys.length > 0
    ? followedPubkeys
    : undefined;
  const authorsKey = authorsFilter ? authorsFilter.slice().sort().join(',') : 'all';

  const { data: hasUnread = false } = useQuery<boolean>({
    queryKey: ['notifications-unread', user?.pubkey ?? '', kindsKey, authorsKey],
    queryFn: async ({ signal }) => {
      if (!user || notificationsCursor === null) return false;

      const filter: { kinds: number[]; '#p': string[]; since: number; limit: number; authors?: string[] } = {
        kinds: enabledKinds,
        '#p': [user.pubkey],
        since: notificationsCursor + 1,
        limit: 1,
        ...(authorsFilter ? { authors: authorsFilter } : {}),
      };

      const events = await nostr.query(
        [filter],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Check that the returned event isn't from the user themselves
      return events.some((e) => e.pubkey !== user.pubkey);
    },
    enabled: !!user && notificationsCursor !== null,
    refetchInterval: Capacitor.isNativePlatform() ? false : 60_000,
    placeholderData: (prev) => prev,
  });

  // Real-time subscription for instant unread-dot updates.
  // When a new notification event arrives, invalidate the query to re-check.
  useEffect(() => {
    if (!user || notificationsCursor === null || Capacitor.isNativePlatform()) return;

    const ac = new AbortController();

    (async () => {
      try {
        for await (const msg of nostr.req(
          [{
            kinds: [...NOTIFICATION_KINDS],
            '#p': [user.pubkey],
            since: Math.floor(Date.now() / 1000),
          }],
          { signal: ac.signal },
        )) {
          if (msg[0] === 'EVENT' && msg[2].pubkey !== user.pubkey) {
            queryClient.invalidateQueries({ queryKey: ['notifications-unread', user.pubkey] });
          }
        }
      } catch {
        // AbortError on cleanup — expected
      }
    })();

    return () => ac.abort();
  }, [nostr, user, notificationsCursor, queryClient]);

  return hasUnread;
}
