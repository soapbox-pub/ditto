/**
 * useFcmNotifications
 *
 * Manages Firebase Cloud Messaging (FCM) push registration with nostr-push on
 * native Android. This is the battery-free, OS-delivered alternative to the
 * "persistent" foreground-service polling: the OS holds the push connection and
 * wakes the app only when a notification arrives.
 *
 * Flow (mirrors usePushNotifications, but with an FCM device token instead of a
 * browser PushSubscription):
 *   - enable():  fetch the FCM token from the native DittoNotification plugin,
 *                then register one nostr-push subscription per notification type.
 *   - disable(): delete those server subscriptions.
 *   - syncPreferences(): toggle per-type active states / $contacts author filter.
 *
 * Like the web flow, RPC events are signed with an ephemeral per-device keypair
 * (see nostrPush.ts) so the user's Nostr signer is never prompted.
 *
 * Only meaningful on native Android with Firebase configured. On other
 * platforms `supported` is false and all methods are no-ops.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { NostrPushClient, type FcmPushSubscription } from '@/lib/nostrPush';
import { NOTIFICATION_TEMPLATES } from '@/lib/notificationTemplates';
import { secureStorage } from '@/lib/secureStorage';
import type { EncryptedSettings } from '@/hooks/useEncryptedSettings';

// ─── Native plugin interface (FCM token accessor) ──────────────────────────────

interface DittoNotificationFcmPlugin {
  /**
   * Returns the FCM registration token for this device, and the Firebase
   * project ID from google-services.json. Rejects if Firebase is not
   * configured or Google Play Services is unavailable.
   */
  getFcmToken(): Promise<{ token: string; projectId: string }>;
}

const DittoNotification = registerPlugin<DittoNotificationFcmPlugin>('DittoNotification');

// ─── Config ─────────────────────────────────────────────────────────────────

const SERVER_PUBKEY: string = import.meta.env.VITE_NOSTR_PUSH_PUBKEY ?? '';

/**
 * Domain used to key subscriptions server-side. On native builds
 * window.location.hostname is "localhost"; use the canonical share origin so
 * FCM subscriptions share the same per-domain VAPID/namespace as the web app.
 */
const DOMAIN: string = (() => {
  const shareOrigin = import.meta.env.VITE_SHARE_ORIGIN;
  if (shareOrigin) {
    try {
      return new URL(shareOrigin).hostname;
    } catch {
      // fall through
    }
  }
  return typeof window !== 'undefined' ? window.location.hostname : '';
})();

/** Relays used for the RPC channel to nostr-push (same set the web hook uses). */
const RPC_RELAYS = [
  'wss://relay.ditto.pub/',
  'wss://relay.primal.net/',
  'wss://relay.damus.io/',
];

/** Secure-storage key for the base subscription ID (shared shape with web). */
const SUBSCRIPTION_ID_KEY = 'ditto-fcm-subscription-id';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateSubscriptionId(): Promise<string> {
  const existing = await secureStorage.getItem(SUBSCRIPTION_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await secureStorage.setItem(SUBSCRIPTION_ID_KEY, id);
  return id;
}

/** Maps notification template IDs to preference keys. */
const TEMPLATE_ID_TO_PREF_KEY: Record<string, keyof NonNullable<EncryptedSettings['notificationPreferences']>> = {
  reactions: 'reactions',
  reposts: 'reposts',
  zaps: 'zaps',
  mentions: 'mentions',
  comments: 'comments',
  badges: 'badges',
  letters: 'letters',
  highlights: 'highlights',
};

/** Build the per-template nostr filter (kinds + #p, optional $contacts). */
function buildFilter(
  kinds: number[],
  userPubkey: string,
  onlyFollowing: boolean,
): { kinds: number[]; '#p': string[]; authors?: string[] } {
  const filter: { kinds: number[]; '#p': string[]; authors?: string[] } = {
    kinds,
    '#p': [userPubkey],
  };
  if (onlyFollowing) {
    filter.authors = ['$contacts'];
  }
  return filter;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseFcmNotificationsReturn {
  /** Whether FCM push is available (native Android + server configured). */
  supported: boolean;
  /** Whether FCM subscriptions are currently registered. */
  enabled: boolean;
  /** Fetch the FCM token and register per-type subscriptions with nostr-push. */
  enable: (userPubkey: string, prefs?: NonNullable<EncryptedSettings['notificationPreferences']>) => Promise<void>;
  /** Delete all FCM subscriptions from nostr-push. */
  disable: () => Promise<void>;
  /** Sync per-type active states / onlyFollowing filter with nostr-push. */
  syncPreferences: (prefs: NonNullable<EncryptedSettings['notificationPreferences']>, userPubkey: string) => Promise<void>;
}

export function useFcmNotifications(): UseFcmNotificationsReturn {
  const supported =
    Capacitor.getPlatform() === 'android' && !!SERVER_PUBKEY;

  const [enabled, setEnabled] = useState(false);
  const clientRef = useRef<NostrPushClient | null>(null);

  // Create the RPC client once on mount (native only).
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    (async () => {
      const client = await NostrPushClient.create(SERVER_PUBKEY, RPC_RELAYS);
      if (cancelled) {
        client.destroy();
        return;
      }
      clientRef.current = client;

      // Returning user: if we have a stored subscription ID, assume enabled.
      const baseId = await secureStorage.getItem(SUBSCRIPTION_ID_KEY);
      if (!cancelled && baseId) setEnabled(true);
    })();

    return () => {
      cancelled = true;
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, [supported]);

  // ─── syncPreferences() ─────────────────────────────────────────────────────

  const syncPreferences = useCallback(async (
    prefs: NonNullable<EncryptedSettings['notificationPreferences']>,
    userPubkey: string,
  ) => {
    const client = clientRef.current;
    const baseId = await secureStorage.getItem(SUBSCRIPTION_ID_KEY);
    if (!client || !baseId) return;

    const onlyFollowing = prefs.onlyFollowing === true;

    await Promise.allSettled(
      NOTIFICATION_TEMPLATES.map((tmpl) => {
        const prefKey = TEMPLATE_ID_TO_PREF_KEY[tmpl.id];
        const isActive = prefKey ? prefs[prefKey] !== false : true;

        return client.updateSubscription({
          subscription_id: `${baseId}-${tmpl.id}`,
          domain: DOMAIN,
          updates: {
            is_active: isActive,
            filter: buildFilter(tmpl.kinds, userPubkey, onlyFollowing),
          },
        }).catch((err) => {
          console.error(`[fcm] Failed to update ${tmpl.id} (is_active=${isActive}):`, err);
        });
      }),
    );
  }, []);

  // ─── enable() ──────────────────────────────────────────────────────────────

  const enable = useCallback(async (
    userPubkey: string,
    prefs?: NonNullable<EncryptedSettings['notificationPreferences']>,
  ) => {
    if (!supported) return;

    const client = clientRef.current;
    if (!client) {
      console.warn('[fcm] NostrPushClient not initialized yet');
      return;
    }

    // Fetch the FCM device token from the native layer.
    const { token, projectId } = await DittoNotification.getFcmToken();
    if (!token || !projectId) {
      throw new Error('[fcm] Native layer returned no FCM token / project ID');
    }

    const pushSubscription: FcmPushSubscription = {
      type: 'fcm',
      device_token: token,
      project_id: projectId,
    };

    const baseId = await getOrCreateSubscriptionId();
    const onlyFollowing = prefs?.onlyFollowing === true;

    await Promise.all(NOTIFICATION_TEMPLATES.map((tmpl) =>
      client.registerSubscription({
        subscription_id: `${baseId}-${tmpl.id}`,
        domain: DOMAIN,
        filter: buildFilter(tmpl.kinds, userPubkey, onlyFollowing),
        notification: {
          title: tmpl.title,
          body: tmpl.body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        },
        push_subscription: pushSubscription,
      })
    ));

    // Apply any existing per-type preferences immediately.
    if (prefs) {
      await syncPreferences(prefs, userPubkey);
    }

    setEnabled(true);
  }, [supported, syncPreferences]);

  // ─── disable() ─────────────────────────────────────────────────────────────

  const disable = useCallback(async () => {
    const client = clientRef.current;
    const baseId = await secureStorage.getItem(SUBSCRIPTION_ID_KEY);

    if (client && baseId) {
      await Promise.allSettled(
        NOTIFICATION_TEMPLATES.map((tmpl) =>
          client.deleteSubscription({
            subscription_id: `${baseId}-${tmpl.id}`,
            domain: DOMAIN,
          }).catch((err) => console.error(`[fcm] Failed to delete ${tmpl.id}:`, err)),
        ),
      );
    }

    setEnabled(false);
  }, []);

  return { supported, enabled, enable, disable, syncPreferences };
}
