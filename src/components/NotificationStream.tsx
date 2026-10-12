import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
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
 * The same REQ also watches the user's encrypted settings event (kind 30078),
 * so a read cursor advanced on another device clears the unread state here
 * without waiting for a refresh. A newer version replaces the cached
 * `encryptedSettings` event, and everything derived from it follows.
 *
 * Relay reconnects are handled by the pool (NRelay1 re-sends REQs on reopen
 * with the original `since`, backfilling anything missed while offline).
 */
export function NotificationStream(): null {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
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
    const settingsKey = ['encryptedSettings', user.pubkey];
    const settingsD = `${config.appId}/metadata`;
    // Start just past the settings version already held, so one written
    // while this device was backgrounded or offline comes in too.
    const heldSettings = queryClient.getQueryData<NostrEvent | null>(settingsKey);
    const settingsSince = heldSettings ? heldSettings.created_at + 1 : since;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      debounce = undefined;
      queryClient.invalidateQueries({ queryKey: ['notifications', user.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', user.pubkey] });
    };

    (async () => {
      try {
        for await (const msg of nostr.req(
          [
            {
              kinds: [...ALL_NOTIFICATION_KINDS],
              '#p': [user.pubkey],
              since,
            },
            {
              kinds: [30078],
              authors: [user.pubkey],
              '#d': [settingsD],
              since: settingsSince,
            },
          ],
          { signal: ac.signal },
        )) {
          if (msg[0] === 'EVENT') {
            const ev = msg[2];
            // Settings written by another device (or this one, echoed back).
            // Keep whichever version is newest.
            if (ev.kind === 30078) {
              const isSettings = ev.pubkey === user.pubkey
                && ev.tags.some(([name, value]) => name === 'd' && value === settingsD);
              const held = queryClient.getQueryData<NostrEvent | null>(settingsKey);
              if (isSettings && (!held || ev.created_at > held.created_at)) {
                queryClient.setQueryData(settingsKey, ev);
              }
              continue;
            }
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
  }, [nostr, user, queryClient, quiet, config.appId]);

  return null;
}
