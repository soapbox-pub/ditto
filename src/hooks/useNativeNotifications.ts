import { useEffect, useRef } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NPool } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import { useEncryptedSettings } from './useEncryptedSettings';
import { getEffectiveRelays } from '@/lib/appRelays';

/** Interface for the native DittoNotification Capacitor plugin. */
interface DittoNotificationPlugin {
  configure(options: { userPubkey?: string; relayUrls?: string[] }): Promise<void>;
}

const DittoNotification = registerPlugin<DittoNotificationPlugin>('DittoNotification');

/** Human-readable label for a notification event kind. */
function notificationTitle(event: NostrEvent): string {
  switch (event.kind) {
    case 7:   return 'New reaction';
    case 6:
    case 16:  return 'New repost';
    case 9735: return 'New zap';
    case 1111: return 'New comment';
    case 1222:
    case 1244: return 'New voice message';
    default:  return 'New mention';
  }
}

/**
 * Hook that manages device/browser notifications for the Nostr app.
 *
 * Capacitor (native): passes user pubkey + relay URLs to the native Android
 * notification service. Respects the user's notificationsEnabled setting.
 *
 * Web/PWA: subscribes to Nostr events via a live relay subscription and
 * fires browser Notification API notifications when the user has both
 * granted browser permission and enabled notifications in their settings.
 */
export function useNativeNotifications(): void {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { settings } = useEncryptedSettings();

  const notificationsEnabled = settings?.notificationsEnabled ?? false;

  // Track the subscription start time so we only surface events that arrive
  // after the subscription is opened (avoids replaying historical events).
  const subStartRef = useRef<number>(Math.floor(Date.now() / 1000));

  // Keep a stable ref to the nostr object to avoid re-subscribing on every render.
  const nostrRef = useRef<NPool>(nostr);
  useEffect(() => { nostrRef.current = nostr; }, [nostr]);

  // Deduplicate: track event IDs that have already triggered a notification.
  const seenIdsRef = useRef<Set<string>>(new Set());

  // ── Capacitor path ────────────────────────────────────────────────────────

  // Request native notification permission on first mount (native only).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      try {
        const { display } = await LocalNotifications.checkPermissions();
        if (display === 'prompt' || display === 'prompt-with-rationale') {
          await LocalNotifications.requestPermissions();
        }
      } catch {
        // Permission check failed — ignore
      }
    })();
  }, []);

  // Configure / deconfigure the native polling service.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (!user || !notificationsEnabled) {
      // Logged out or user disabled notifications — stop the native service.
      DittoNotification.configure({});
      return;
    }

    const effectiveRelays = getEffectiveRelays(config.relayMetadata, config.useAppRelays);
    const relayUrls = effectiveRelays.relays
      .filter((r) => r.read)
      .map((r) => r.url);

    if (relayUrls.length === 0) return;

    DittoNotification.configure({
      userPubkey: user.pubkey,
      relayUrls,
    });
  }, [user, config.relayMetadata, config.useAppRelays, notificationsEnabled]);

  // ── Web / PWA path ────────────────────────────────────────────────────────

  useEffect(() => {
    // Only run on web (not native Capacitor).
    if (Capacitor.isNativePlatform()) return;
    // Need a logged-in user, notifications enabled in settings, and browser permission.
    if (!user || !notificationsEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Record when we opened the subscription so old events are ignored.
    subStartRef.current = Math.floor(Date.now() / 1000);

    const controller = new AbortController();

    (async () => {
      try {
        const stream = nostrRef.current.req(
          [{
            kinds: [1, 6, 7, 16, 9735, 1111, 1222, 1244],
            '#p': [user.pubkey],
            since: subStartRef.current,
          }],
          { signal: controller.signal },
        );

        for await (const msg of stream) {
          if (msg[0] !== 'EVENT') continue;
          const event: NostrEvent = msg[2];

          // Skip own events
          if (event.pubkey === user.pubkey) continue;
          // Skip events older than when the sub opened (relay may send a burst)
          if (event.created_at < subStartRef.current) continue;
          // Deduplicate: skip if we've already shown a notification for this event
          if (seenIdsRef.current.has(event.id)) continue;
          seenIdsRef.current.add(event.id);

          new Notification(notificationTitle(event), {
            body: event.content.slice(0, 120) || undefined,
            tag: event.id,
            icon: '/favicon.ico',
          });
        }
      } catch {
        // Subscription closed or errored — ignore
      }
    })();

    return () => {
      controller.abort();
    };
  }, [user, notificationsEnabled]);
}
