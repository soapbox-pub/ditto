import { useCallback } from 'react';
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
}

/**
 * Hook to query notifications and track unread status
 * Uses encrypted settings to persist the last-viewed timestamp
 */
export function useNotifications(): NotificationData {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { settings, updateSettings, isLoading: settingsLoading } = useEncryptedSettings();

  const { data: notifications = [], isLoading } = useQuery<NostrEvent[]>({
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
    enabled: !!user,
    refetchInterval: 60_000, // Refetch every minute for new notifications
  });

  // Get cursor from encrypted settings (defaults to 0 if not set)
  const notificationsCursor = settings?.notificationsCursor ?? 0;

  // Determine which notifications are new (created after cursor)
  const newNotifications = notifications.filter(
    (event) => event.created_at > notificationsCursor
  );

  const hasUnread = newNotifications.length > 0;

  // Mark all current notifications as read by updating the cursor
  const markAsRead = useCallback(async () => {
    if (!user || notifications.length === 0) return;

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
  }, [user, notifications, notificationsCursor, updateSettings]);

  return {
    notifications,
    newNotifications,
    hasUnread,
    markAsRead,
    isLoading,
  };
}
