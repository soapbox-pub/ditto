import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from './useCurrentUser';
import { useEncryptedSettings } from './useEncryptedSettings';
import { useFollowList } from './useFollowActions';
import { useReplyFlood } from './useReplyFlood';
import { getEnabledNotificationKinds } from '@/lib/notificationKinds';

/** Unread events to sample per check — enough to let flood detection see the crowd. */
const UNREAD_BATCH = 100;

/**
 * Lightweight hook that checks whether the user has any unread notifications.
 * Fetches a small batch of events newer than the read cursor (using `since` to
 * filter at the relay level) — cheaper than the full notification list, but a
 * batch rather than a single event so likely-spam floods can be detected.
 *
 * Respects the user's per-type notification preferences so that disabled
 * types (e.g. reactions) don't trigger the unread dot.
 *
 * Reply-flood detection (`useReplyFlood`) runs over the batch and the dot only
 * lights if an unread event SURVIVES the filter — the same "fold likely spam"
 * heuristic the thread view uses, extended so a wall of throwaway-key spam
 * mentions never lights the dot. The reader's own events and events from people
 * they follow are never treated as spam.
 *
 * Real-time updates are handled by the always-mounted NotificationStream
 * component, which holds a persistent relay subscription and invalidates the
 * `notifications-unread` query key when new events arrive — no polling.
 *
 * Use this in navigation components (sidebar, mobile bottom nav) for the dot indicator.
 * Use `useNotifications` on the actual notifications page where the full list is needed.
 */
export function useHasUnreadNotifications(): boolean {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { settings } = useEncryptedSettings();
  const { floodIds } = useReplyFlood();

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
        limit: UNREAD_BATCH,
        ...(authorsFilter ? { authors: authorsFilter } : {}),
      };

      const events = await nostr.query(
        [filter],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Drop the user's own events, then fold out likely-spam floods so a wall
      // of throwaway-key spam never lights the dot. The dot lights only when an
      // unread event survives — a real interaction, or spam too sparse to flag.
      const unread = events.filter((e) => e.pubkey !== user.pubkey);
      const flooded = floodIds(unread);
      return unread.some((e) => !flooded.has(e.id));
    },
    enabled: !!user && notificationsCursor !== null,
    // No polling — the NotificationStream subscription invalidates this query
    // when a new notification event arrives over the persistent websocket.
    placeholderData: (prev) => prev,
  });

  return hasUnread;
}
