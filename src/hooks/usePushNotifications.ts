/**
 * usePushNotifications
 *
 * Manages the Web Push notification lifecycle via nostr-push.
 *
 * - Registers the service worker and restores push state on mount.
 * - enable(): fetches the VAPID key, subscribes to Web Push, and registers
 *   per-type subscriptions with nostr-push. Must be called from a user gesture
 *   AFTER Notification.requestPermission() has already been granted.
 * - disable(): deletes server subscriptions and unsubscribes the browser.
 *
 * Uses an ephemeral device keypair (persisted in localStorage) to sign RPC
 * events so the user's Nostr signer is never prompted.
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
  /** Subscribe and register with nostr-push. Caller must request permission first. */
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
        // Returning user: if permission is already granted and a browser push
        // subscription exists, restore the enabled state silently.
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

  const enable = useCallback(async (userPubkey: string) => {
    if (!supported) return;

    // Caller must have already obtained permission (from a user gesture).
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      console.warn('[push] enable() called but Notification.permission is', Notification.permission);
      return;
    }

    const client = clientRef.current;
    if (!client) {
      console.warn('[push] NostrPushClient not initialized — service worker may still be loading');
      return;
    }

    // Fetch VAPID key (cached after first fetch).
    let vapidPublicKey = localStorage.getItem(VAPID_KEY_CACHE);
    if (!vapidPublicKey) {
      vapidPublicKey = await client.getVapidKey(DOMAIN);
      localStorage.setItem(VAPID_KEY_CACHE, vapidPublicKey);
    }

    // Get or create the browser push subscription.
    const reg = swRegistrationRef.current ?? await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }
    pushSubRef.current = sub;

    // Register one subscription per notification type with nostr-push.
    const baseId = getOrCreateSubscriptionId();
    const serialized = serializePushSubscription(sub);

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

    setEnabled(true);
  }, [supported]);

  // ─── disable() ────────────────────────────────────────────────────────────

  const disable = useCallback(async () => {
    const client = clientRef.current;
    const baseId = localStorage.getItem(SUBSCRIPTION_ID_KEY);

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
