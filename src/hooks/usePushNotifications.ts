/**
 * usePushNotifications
 *
 * Manages the Web Push notification lifecycle for Ditto via nostr-push.
 *
 * - Registers the service worker on mount.
 * - On enable(): requests browser permission, fetches the VAPID key from the
 *   nostr-push server, subscribes to Web Push, and registers the subscription
 *   with the server for each notification kind the user cares about.
 * - On disable(): deletes server subscriptions and unsubscribes the browser.
 *
 * Uses an ephemeral device keypair (not the user's Nostr key) for signing
 * the RPC events, so the user's signer is never prompted.
 *
 * Environment variables:
 *   VITE_NOSTR_PUSH_PUBKEY — hex pubkey of the nostr-push server
 */

import { useEffect, useRef, useCallback, useState } from 'react';

import { NostrPushClient, serializePushSubscription, urlBase64ToUint8Array } from '@/lib/nostrPush';
import { NOTIFICATION_TEMPLATES } from '@/lib/notificationTemplates';

// ─── Config ───────────────────────────────────────────────────────────────────

const SERVER_PUBKEY: string = import.meta.env.VITE_NOSTR_PUSH_PUBKEY ?? '';
const DOMAIN = typeof window !== 'undefined' ? window.location.hostname : '';

/** Relays used for the RPC channel to nostr-push. */
const RPC_RELAYS = [
  'wss://relay.ditto.pub/',
  'wss://relay.primal.net/',
  'wss://relay.damus.io/',
];

// localStorage keys
const VAPID_KEY_CACHE = 'ditto-push-vapid-key';
const SUBSCRIPTION_ID_KEY = 'ditto-push-subscription-id';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateSubscriptionId(): string {
  const existing = localStorage.getItem(SUBSCRIPTION_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(SUBSCRIPTION_ID_KEY, id);
  return id;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePushNotificationsReturn {
  /** Current browser permission state. */
  permission: NotificationPermission;
  /** Whether Web Push is currently active and registered. */
  enabled: boolean;
  /** Whether the browser and environment support Web Push. */
  supported: boolean;
  /** Request permission, subscribe, and register with nostr-push. Must be called from a user gesture. */
  enable: (userPubkey: string) => Promise<void>;
  /** Unsubscribe from Web Push and delete server registrations. */
  disable: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!SERVER_PUBKEY;

  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  const [enabled, setEnabled] = useState(false);

  const pushSubRef = useRef<PushSubscription | null>(null);
  const clientRef = useRef<NostrPushClient | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // ─── Register SW + restore state on mount ─────────────────────────────────

  useEffect(() => {
    if (!supported) return;

    clientRef.current = new NostrPushClient(SERVER_PUBKEY, RPC_RELAYS);

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        swRegistrationRef.current = reg;
        return navigator.serviceWorker.ready;
      })
      .then(async (reg) => {
        // If permission was already granted and a push subscription exists,
        // restore the enabled state silently (no RPC needed — server already has it).
        // We check only the browser's actual subscription state, not localStorage,
        // because localStorage can get out of sync (cleared independently, etc.).
        if (Notification.permission === 'granted') {
          const existing = await reg.pushManager.getSubscription();
          if (existing) {
            pushSubRef.current = existing;
            setPermission('granted');
            setEnabled(true);
          }
        }
      })
      .catch((err) => console.error('[push] SW registration failed:', err));

    return () => {
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, []);

  // ─── enable() ─────────────────────────────────────────────────────────────
  // Called from NotificationSettings click handler AFTER permission is already
  // granted. Does NOT call requestPermission() itself — the caller is
  // responsible for that (and must do so from a user gesture for iOS).

  const enable = useCallback(async (userPubkey: string) => {
    if (!supported) {
      console.warn('[push] enable() called but push not supported');
      return;
    }

    // Verify permission was already granted by the caller.
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      console.warn('[push] enable() called but Notification.permission is', Notification.permission);
      return;
    }

    const client = clientRef.current;
    if (!client) {
      console.warn('[push] NostrPushClient not initialized — service worker may still be loading');
      return;
    }

    // Get or fetch VAPID key
    let vapidPublicKey = localStorage.getItem(VAPID_KEY_CACHE);
    if (!vapidPublicKey) {
      console.debug('[push] Fetching VAPID key from nostr-push server for domain:', DOMAIN);
      vapidPublicKey = await client.getVapidKey(DOMAIN);
      localStorage.setItem(VAPID_KEY_CACHE, vapidPublicKey);
      console.debug('[push] Got VAPID key:', vapidPublicKey.substring(0, 20) + '...');
    } else {
      console.debug('[push] Using cached VAPID key');
    }

    // Get or create push subscription
    const reg = swRegistrationRef.current ?? await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      console.debug('[push] Creating new push subscription');
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    } else {
      console.debug('[push] Reusing existing push subscription');
    }
    pushSubRef.current = sub;

    const baseId = getOrCreateSubscriptionId();
    const serialized = serializePushSubscription(sub);

    console.debug('[push] Registering', NOTIFICATION_TEMPLATES.length, 'subscription(s) with nostr-push');

    // Register one subscription per notification type so each gets a
    // tailored template (matching the Android native notification text).
    await Promise.all(NOTIFICATION_TEMPLATES.map((tmpl) =>
      client.registerSubscription({
        subscription_id: `${baseId}-${tmpl.id}`,
        domain: DOMAIN,
        filter: {
          kinds: tmpl.kinds,
          '#p': [userPubkey],
        },
        notification: {
          title: tmpl.title,
          body: tmpl.body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        },
        push_subscription: serialized,
      }),
    ));

    console.debug('[push] All subscriptions registered successfully');
    setEnabled(true);
  }, [supported]);

  // ─── disable() ────────────────────────────────────────────────────────────

  const disable = useCallback(async () => {
    const client = clientRef.current;
    const baseId = localStorage.getItem(SUBSCRIPTION_ID_KEY);

    // Delete all per-type subscriptions from nostr-push server
    if (client && baseId) {
      await Promise.allSettled(
        NOTIFICATION_TEMPLATES.map((tmpl) =>
          client.deleteSubscription({
            subscription_id: `${baseId}-${tmpl.id}`,
            domain: DOMAIN,
          }).catch((err) => console.error(`[push] Failed to delete ${tmpl.id}:`, err)),
        ),
      );
    }

    // Unsubscribe browser push
    const pushSub = pushSubRef.current;
    if (pushSub) {
      try {
        await pushSub.unsubscribe();
      } catch { /* ignore */ }
      pushSubRef.current = null;
    }

    setEnabled(false);
  }, []);

  return { permission, enabled, supported, enable, disable };
}
