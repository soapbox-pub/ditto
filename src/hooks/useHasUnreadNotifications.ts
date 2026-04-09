import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';

import { useCurrentUser } from './useCurrentUser';
import { useEncryptedSettings } from './useEncryptedSettings';
import { useFollowList } from './useFollowActions';
import { getEnabledNotificationKinds } from '@/lib/notificationKinds';

/**
 * Lightweight hook that checks whether the user has any unread notifications.
 * Fetches at most 1 event (using `since` to filter at the relay level),
 * making it much cheaper than loading the full notification list.
 *
 * Respects the user's per-type notification preferences so that disabled
 * types (e.g. reactions) don't trigger the unread dot.
 *
 * Real-time updates are handled by the subscription in `useNotifications`,
 * which invalidates the `notifications-unread` query key when new events
 * arrive. This hook only needs polling as a fallback.
 *
 * Use this in navigation components (sidebar, mobile bottom nav) for the dot indicator.
 * Use `useNotifications` on the actual notifications page where the full list is needed.
 */
export function useHasUnreadNotifications(): boolean {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { settings } = useEncryptedSettings();

  // Only use cursor if settings have actually loaded, otherwise null
  const notificationsCursor = settings !== undefined && settings !== null
    ? (settings.notificationsCursor ?? 0)
    : null;

  const { data: followData } = useFollowList();

  const prefs = settings?.notificationPreferences;
  const notificationStyle = settings?.notificationStyle ?? 'push';

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
    // Disable polling on native only when using persistent mode (foreground service
    // handles it). In push mode on native, poll like web since there's no service.
    refetchInterval: Capacitor.isNativePlatform() && notificationStyle === 'persistent' ? false : 60_000,
    placeholderData: (prev) => prev,
  });

  return hasUnread;
}
