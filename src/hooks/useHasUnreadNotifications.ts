import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';

import { useCurrentUser } from './useCurrentUser';
import { useEncryptedSettings } from './useEncryptedSettings';
import { getEnabledNotificationKinds } from '@/lib/notificationKinds';

/**
 * Lightweight hook that checks whether the user has any unread notifications.
 * Fetches at most 1 event (using `since` to filter at the relay level),
 * making it much cheaper than loading the full notification list.
 *
 * Respects the user's per-type notification preferences so that disabled
 * types (e.g. reactions) don't trigger the unread dot.
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

  // Derive enabled kinds from preferences so disabled types don't trigger the dot
  const enabledKinds = useMemo(
    () => getEnabledNotificationKinds(settings?.notificationPreferences),
    [settings?.notificationPreferences],
  );
  const kindsKey = [...enabledKinds].sort().join(',');

  const { data: hasUnread = false } = useQuery<boolean>({
    queryKey: ['notifications-unread', user?.pubkey ?? '', kindsKey],
    queryFn: async ({ signal }) => {
      if (!user || notificationsCursor === null) return false;

      const events = await nostr.query(
        [{
          kinds: enabledKinds,
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
