import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';

import { useCurrentUser } from './useCurrentUser';
import { useEncryptedSettings } from './useEncryptedSettings';

/**
 * Lightweight hook that checks whether the user has any unread notifications.
 * Fetches at most 1 event (using `since` to filter at the relay level),
 * making it much cheaper than loading the full notification list.
 *
 * Use this in navigation components (sidebar, bottom nav) for the dot indicator.
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

  const { data: hasUnread = false } = useQuery<boolean>({
    queryKey: ['notifications-unread', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user || notificationsCursor === null) return false;

      const events = await nostr.query(
        [{
          kinds: [1, 6, 16, 7, 9735, 1111, 1222, 1244],
          '#p': [user.pubkey],
          since: notificationsCursor + 1,
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Check that the returned event isn't from the user themselves
      return events.some((e) => e.pubkey !== user.pubkey);
    },
    enabled: !!user && notificationsCursor !== null,
    refetchInterval: Capacitor.isNativePlatform() ? false : 60_000,
    placeholderData: (prev) => prev,
  });

  return hasUnread;
}
