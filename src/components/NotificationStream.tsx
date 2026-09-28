import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';

import { useBackgroundQuiet } from '@/hooks/useBackgroundQuiet';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { createLiveCursor } from '@/lib/backgroundQuiet';
import { ALL_NOTIFICATION_KINDS } from '@/lib/notificationKinds';

/**
 * Coalesce a burst of incoming notifications into one refetch. Invalidating
 * per event cancelled and restarted the same relay queries dozens of times
 * when a popular post drew a wave of reactions.
 */
const INVALIDATE_DEBOUNCE_MS = 1_500;

/**
 * NotificationStream — always-mounted persistent relay subscription for
 * notifications (armada-style websocket listen instead of polling).
 *
 * Opens a single long-lived REQ (`#p: [user.pubkey]`, `since: now`) through
 * the app's relay pool. When a new notification event arrives, it invalidates
 * the `notifications` and `notifications-unread` query caches (once per
 * burst) so the notifications page and the nav-dot badge refetch.
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
  // Backgrounded the WebView holds no REQ: the native service (or push)
  // watches instead, and resuming refetches what arrived.
  const quiet = useBackgroundQuiet();
  const cursorRef = useRef(createLiveCursor());

  useEffect(() => {
    if (!user) return;
    const live = cursorRef.current.next(user.pubkey, quiet);
    if (!live) return;

    if (live.resumed) {
      queryClient.invalidateQueries({ queryKey: ['notifications', user.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', user.pubkey] });
    }

    const ac = new AbortController();
    const since = Math.floor(Date.now() / 1000);
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      debounce = undefined;
      queryClient.invalidateQueries({ queryKey: ['notifications', user.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', user.pubkey] });
    };

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
            // unread indicator, once per burst.
            if (debounce === undefined) debounce = setTimeout(invalidate, INVALIDATE_DEBOUNCE_MS);
          }
        }
      } catch {
        // AbortError on cleanup — expected
      }
    })();

    return () => {
      ac.abort();
      clearTimeout(debounce);
    };
  }, [nostr, user, queryClient, quiet]);

  return null;
}
