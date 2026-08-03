import { useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ALL_NOTIFICATION_KINDS } from '@/lib/notificationKinds';

/**
 * NotificationStream — always-mounted persistent relay subscription for
 * notifications (armada-style websocket listen instead of polling).
 *
 * Opens a single long-lived REQ (`#p: [user.pubkey]`, `since: now`) through
 * the app's relay pool. When a new notification event arrives, it invalidates
 * the `notifications` and `notifications-unread` query caches so the
 * notifications page and the nav-dot badge refetch immediately.
 *
 * The invalidated queries apply the user's per-type preferences, the
 * "only following" authors filter, and the read cursor at refetch time, so
 * this stream can subscribe broadly (all kinds, no authors filter) without
 * resubscribing whenever preferences change.
 *
 * Relay reconnects are handled by the pool (NRelay1 re-sends REQs on reopen
 * with the original `since`, backfilling anything missed while offline).
 */
export function NotificationStream(): null {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const ac = new AbortController();
    const since = Math.floor(Date.now() / 1000);

    (async () => {
      try {
        for await (const msg of nostr.req(
          [{
            kinds: [...ALL_NOTIFICATION_KINDS],
            '#p': [user.pubkey],
            since,
          }],
          { signal: ac.signal },
        )) {
          if (msg[0] === 'EVENT') {
            const ev = msg[2];
            // Ignore own events
            if (ev.pubkey === user.pubkey) continue;
            // New notification arrived — invalidate both the full list and the
            // unread indicator so the UI updates immediately.
            queryClient.invalidateQueries({ queryKey: ['notifications', user.pubkey] });
            queryClient.invalidateQueries({ queryKey: ['notifications-unread', user.pubkey] });
          }
        }
      } catch {
        // AbortError on cleanup — expected
      }
    })();

    return () => ac.abort();
  }, [nostr, user, queryClient]);

  return null;
}
