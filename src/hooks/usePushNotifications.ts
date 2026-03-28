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
import type { EncryptedSettings } from '@/hooks/useEncryptedSettings';

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

/** Maps notification template IDs to preference keys. */
const TEMPLATE_ID_TO_PREF_KEY: Record<string, keyof NonNullable<EncryptedSettings['notificationPreferences']>> = {
  reactions: 'reactions',
  reposts: 'reposts',
  zaps: 'zaps',
  mentions: 'mentions',
  comments: 'comments',
  letters: 'letters',
};

export interface UsePushNotificationsReturn {
  /** Current browser permission state. */
  permission: NotificationPermission;
  /** Whether Web Push is currently active and registered. */
  enabled: boolean;
  /** Whether the browser and environment support Web Push. */
  supported: boolean;
  /** Subscribe and register with nostr-push. Caller must request permission first. */
  enable: (userPubkey: string, prefs?: NonNullable<EncryptedSettings['notificationPreferences']>) => Promise<void>;
  /** Unsubscribe from Web Push and delete server registrations. */
  disable: () => Promise<void>;
  /**
   * Sync per-type subscription active states and filter settings with nostr-push.
   * Call this when notification type preferences or onlyFollowing changes.
   */
  syncPreferences: (prefs: NonNullable<EncryptedSettings['notificationPreferences']>, userPubkey: string) => Promise<void>;
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
  // Pre-fetched VAPID key so enable() doesn't need an async network call
  // before pushManager.subscribe() — browsers require that call to be
  // synchronously reachable from the user gesture.
  const vapidKeyRef = useRef<string | null>(null);

  // ─── Register SW + restore state on mount ─────────────────────────────────

  useEffect(() => {
    if (!supported) return;

    const client = new NostrPushClient(SERVER_PUBKEY, RPC_RELAYS);
    clientRef.current = client;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        swRegistrationRef.current = reg;
        return navigator.serviceWorker.ready;
      })
      .then(async (reg) => {
        // Pre-fetch and cache the VAPID key so it is ready before the user
        // clicks "Enable". This keeps pushManager.subscribe() as the first
        // async step inside enable(), satisfying the browser's user-gesture
        // requirement (otherwise the intermediate network await breaks the
        // activation chain and throws "DOMException: The operation is insecure").
        let vapidKey = localStorage.getItem(VAPID_KEY_CACHE);
        if (!vapidKey) {
          try {
            vapidKey = await client.getVapidKey(DOMAIN);
            localStorage.setItem(VAPID_KEY_CACHE, vapidKey);
          } catch (err) {
            console.warn('[push] Failed to pre-fetch VAPID key:', err);
          }
        }
        if (vapidKey) {
          vapidKeyRef.current = vapidKey;
        }

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

  const enable = useCallback(async (userPubkey: string, prefs?: NonNullable<EncryptedSettings['notificationPreferences']>) => {
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

    // Use the VAPID key pre-fetched on mount (already in vapidKeyRef and
    // localStorage). Avoid any network round-trip here — an async await
    // before pushManager.subscribe() breaks the user-gesture activation chain
    // and causes "DOMException: The operation is insecure" in strict browsers.
    let vapidPublicKey = vapidKeyRef.current ?? localStorage.getItem(VAPID_KEY_CACHE);
    if (!vapidPublicKey) {
      // Should rarely happen (pre-fetch failed on mount). Log a warning but
      // still attempt the fetch; on browsers that enforce the gesture chain
      // this may still throw the insecure-operation error.
      console.warn('[push] VAPID key not pre-fetched; fetching now (may fail on strict browsers)');
      vapidPublicKey = await client.getVapidKey(DOMAIN);
      localStorage.setItem(VAPID_KEY_CACHE, vapidPublicKey);
      vapidKeyRef.current = vapidPublicKey;
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
    const onlyFollowing = prefs?.onlyFollowing === true;

    await Promise.all(NOTIFICATION_TEMPLATES.map((tmpl) => {
      const filter: { kinds: number[]; '#p': string[]; authors?: string[] } = {
        kinds: tmpl.kinds,
        '#p': [userPubkey],
      };
      if (onlyFollowing) {
        filter.authors = ['$contacts'];
      }
      return client.registerSubscription({
        subscription_id: `${baseId}-${tmpl.id}`,
        domain: DOMAIN,
        filter,
        notification: {
          title: tmpl.title,
          body: tmpl.body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        },
        push_subscription: serialized,
      });
    }));

    // If any per-type preferences are already set, sync them immediately
    // so newly registered subscriptions respect existing disabled types.
    if (prefs) {
      await syncPreferences(prefs, userPubkey);
    }

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

  // ─── syncPreferences() ─────────────────────────────────────────────────────

  const syncPreferences = useCallback(async (
    prefs: NonNullable<EncryptedSettings['notificationPreferences']>,
    userPubkey: string,
  ) => {
    const client = clientRef.current;
    const baseId = localStorage.getItem(SUBSCRIPTION_ID_KEY);
    if (!client || !baseId) return;

    const onlyFollowing = prefs.onlyFollowing === true;

    await Promise.allSettled(
      NOTIFICATION_TEMPLATES.map((tmpl) => {
        const prefKey = TEMPLATE_ID_TO_PREF_KEY[tmpl.id];
        // Default to active when the preference is absent
        const isActive = prefKey ? prefs[prefKey] !== false : true;

        // Build the full filter — includes #p and optionally $contacts
        const filter: { kinds: number[]; '#p': string[]; authors?: string[] } = {
          kinds: tmpl.kinds,
          '#p': [userPubkey],
        };
        if (onlyFollowing) {
          filter.authors = ['$contacts'];
        }

        return client.updateSubscription({
          subscription_id: `${baseId}-${tmpl.id}`,
          domain: DOMAIN,
          updates: { is_active: isActive, filter },
        }).catch((err) => {
          console.error(`[push] Failed to update ${tmpl.id} (is_active=${isActive}):`, err);
        });
      }),
    );
  }, []);

  return { permission, enabled, supported, enable, disable, syncPreferences };
}
