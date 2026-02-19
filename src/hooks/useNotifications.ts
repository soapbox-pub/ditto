import { useCallback, useState, useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useEncryptedSettings } from './useEncryptedSettings';

export interface NotificationData {
  /** All notifications */
  notifications: NostrEvent[];
  /** Notifications newer than cursor (unread) */
  newNotifications: NostrEvent[];
  /** Whether there are any unread notifications */
  hasUnread: boolean;
  /** Mark all current notifications as read */
  markAsRead: () => Promise<void>;
  /** Loading state */
  isLoading: boolean;
  /** Whether the query has completed at least once */
  hasFetched: boolean;
}

/**
 * Hook to query notifications and track unread status
 * Uses encrypted settings to persist the last-viewed timestamp
 */
export function useNotifications(): NotificationData {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { settings, updateSettings, isLoading: settingsLoading } = useEncryptedSettings();

  // Delay notifications query by 3 seconds to avoid competing with feed load
  const [queryEnabled, setQueryEnabled] = useState(false);
  
  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => setQueryEnabled(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [user]);

  const { data: notifications = [], isLoading, isFetched } = useQuery<NostrEvent[]>({
    queryKey: ['notifications', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const events = await nostr.query(
        [{ kinds: [1, 6, 7, 9735], '#p': [user.pubkey], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events
        .filter((e) => e.pubkey !== user.pubkey)
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: queryEnabled && !!user,
    refetchInterval: 60_000, // Refetch every minute for new notifications
    placeholderData: (prev) => prev, // Keep previous data during refetch to prevent flickering
  });

  // Only use cursor if settings have actually loaded, otherwise null
  // This prevents false positives when settings are still loading
  const notificationsCursor = settings !== undefined && settings !== null 
    ? (settings.notificationsCursor ?? 0)
    : null;

  // Determine which notifications are new (created after cursor)
  // Only calculate if we have a valid cursor (settings loaded)
  const newNotifications = notificationsCursor !== null
    ? notifications.filter((event) => event.created_at > notificationsCursor)
    : [];

  // Only show unread badge when:
  // 1. Settings have loaded (cursor is not null)
  // 2. Notifications query has run
  // 3. There are new notifications
  const hasUnread = notificationsCursor !== null && queryEnabled && newNotifications.length > 0;

  // Mark all current notifications as read by updating the cursor
  const markAsRead = useCallback(async () => {
    if (!user || notifications.length === 0 || notificationsCursor === null) return;

    // Set cursor to the timestamp of the newest notification
    const newestTimestamp = Math.max(...notifications.map((e) => e.created_at));

    // Only update if the cursor would actually change
    if (newestTimestamp <= notificationsCursor) {
      return; // Already marked as read
    }

    try {
      await updateSettings.mutateAsync({
        notificationsCursor: newestTimestamp,
      });
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey, notifications.length, notificationsCursor]);

  return {
    notifications,
    newNotifications,
    hasUnread,
    markAsRead,
    isLoading,
    hasFetched: isFetched,
  };
}
