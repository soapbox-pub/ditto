/**
 * Web Push transport, backed by a nostr-push server.
 *
 * The server holds the relay subscriptions, renders the notification text from
 * the templates registered here, and delivers it through the browser's push
 * service. This adapter is the client half: it registers the service worker,
 * subscribes the browser to Web Push, and keeps one server-side subscription
 * per notification type so each type can be toggled independently.
 *
 * RPC is signed with an ephemeral per-device key (see `NostrPushClient`), so
 * the user's own signer is never prompted.
 *
 * Lifted verbatim out of `usePushNotifications`; the comments about the
 * user-gesture chain are load-bearing, not decoration.
 */

import { NostrPushClient, serializePushSubscription, urlBase64ToUint8Array } from '@/lib/nostrPush';
import { NOTIFICATION_TEMPLATES } from '@/lib/notificationTemplates';
import type { PushAdapter, PushContext, PushPreferences } from '@/lib/push/types';

/** Relays used for the RPC channel to nostr-push. */
const RPC_RELAYS = [
  'wss://relay.ditto.pub/',
  'wss://relay.primal.net/',
  'wss://relay.damus.io/',
];

// localStorage keys
const VAPID_KEY_CACHE = 'ditto-push-vapid-key';
const SUBSCRIPTION_ID_KEY = 'ditto-push-subscription-id';

/** Maps notification template IDs to preference keys. */
const TEMPLATE_ID_TO_PREF_KEY: Record<string, keyof PushPreferences> = {
  reactions: 'reactions',
  reposts: 'reposts',
  zaps: 'zaps',
  mentions: 'mentions',
  comments: 'comments',
  badges: 'badges',
  letters: 'letters',
  highlights: 'highlights',
  quizzes: 'quizzes',
};

function getOrCreateSubscriptionId(): string {
  const existing = localStorage.getItem(SUBSCRIPTION_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(SUBSCRIPTION_ID_KEY, id);
  return id;
}

/** The filter one template registers, for one user, under one filter mode. */
function templateFilter(
  kinds: number[],
  pubkey: string,
  onlyFollowing: boolean,
): { kinds: number[]; '#p': string[]; authors?: string[] } {
  const filter: { kinds: number[]; '#p': string[]; authors?: string[] } = {
    kinds,
    '#p': [pubkey],
  };
  // `$contacts` is expanded server-side into the user's follow set.
  if (onlyFollowing) filter.authors = ['$contacts'];
  return filter;
}

export class NostrPushAdapter implements PushAdapter {
  readonly transport = 'nostr-push' as const;
  readonly supported: boolean;
  readonly needsBrowserPermission = true;
  /** The server holds the relay subscriptions and expands `$contacts` itself. */
  readonly ownsSubscriptions = false;

  private client: NostrPushClient | null = null;
  private registration: ServiceWorkerRegistration | null = null;
  private pushSubscription: PushSubscription | null = null;
  /**
   * Pre-fetched VAPID key so `enable()` needs no async network call before
   * `pushManager.subscribe()` — browsers require that call to be synchronously
   * reachable from the user gesture.
   */
  private vapidKey: string | null = null;
  private destroyed = false;

  constructor(
    private readonly serverPubkey: string,
    private readonly domain: string,
  ) {
    this.supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      !!serverPubkey;
  }

  async init(): Promise<void> {
    if (!this.supported || this.destroyed) return;

    // Load the device key from secure storage before the rest of the bring-up
    // sequence; everything below depends on `this.client` being set.
    const client = await NostrPushClient.create(this.serverPubkey, RPC_RELAYS);
    if (this.destroyed) {
      client.destroy();
      return;
    }
    this.client = client;

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.registration = reg;
      await navigator.serviceWorker.ready;
      if (this.destroyed) return;

      // Pre-fetch and cache the VAPID key so it is ready before the user clicks
      // "Enable". This keeps pushManager.subscribe() as the first async step
      // inside enable(), satisfying the browser's user-gesture requirement
      // (otherwise the intermediate network await breaks the activation chain
      // and throws "DOMException: The operation is insecure").
      let vapidKey = localStorage.getItem(VAPID_KEY_CACHE);
      if (!vapidKey) {
        try {
          vapidKey = await client.getVapidKey(this.domain);
          localStorage.setItem(VAPID_KEY_CACHE, vapidKey);
        } catch (err) {
          console.warn('[push] Failed to pre-fetch VAPID key:', err);
        }
      }
      if (this.destroyed) return;
      if (vapidKey) this.vapidKey = vapidKey;

      // Returning user: adopt the existing browser subscription so isEnabled()
      // reports true without another round of consent.
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const existing = await reg.pushManager.getSubscription();
        if (this.destroyed) return;
        if (existing) this.pushSubscription = existing;
      }
    } catch (err) {
      console.error('[push] SW registration failed:', err);
    }
  }

  async isEnabled(): Promise<boolean> {
    return !!this.pushSubscription;
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof Notification === 'undefined') return 'denied';
    return Notification.requestPermission();
  }

  async enable({ pubkey, prefs }: PushContext): Promise<void> {
    if (!this.supported) return;

    // Caller must have already obtained permission (from a user gesture).
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      console.warn('[push] enable() called but Notification.permission is', Notification.permission);
      return;
    }

    const client = this.client;
    if (!client) {
      console.warn('[push] NostrPushClient not initialized — service worker may still be loading');
      return;
    }

    // Use the VAPID key pre-fetched on mount (already in this.vapidKey and
    // localStorage). Avoid any network round-trip here — an async await before
    // pushManager.subscribe() breaks the user-gesture activation chain and
    // causes "DOMException: The operation is insecure" in strict browsers.
    let vapidPublicKey = this.vapidKey ?? localStorage.getItem(VAPID_KEY_CACHE);
    if (!vapidPublicKey) {
      // Should rarely happen (pre-fetch failed on mount). Log a warning but
      // still attempt the fetch; on browsers that enforce the gesture chain
      // this may still throw the insecure-operation error.
      console.warn('[push] VAPID key not pre-fetched; fetching now (may fail on strict browsers)');
      vapidPublicKey = await client.getVapidKey(this.domain);
      localStorage.setItem(VAPID_KEY_CACHE, vapidPublicKey);
      this.vapidKey = vapidPublicKey;
    }

    // Get or create the browser push subscription.
    const reg = this.registration ?? await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }
    this.pushSubscription = sub;

    // Register one subscription per notification type with nostr-push.
    const baseId = getOrCreateSubscriptionId();
    const serialized = serializePushSubscription(sub);
    const onlyFollowing = prefs?.onlyFollowing === true;

    await Promise.all(NOTIFICATION_TEMPLATES.map((tmpl) =>
      client.registerSubscription({
        subscription_id: `${baseId}-${tmpl.id}`,
        domain: this.domain,
        filter: templateFilter(tmpl.kinds, pubkey, onlyFollowing),
        notification: {
          title: tmpl.title,
          body: tmpl.body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        },
        push_subscription: serialized,
      })
    ));

    // If any per-type preferences are already set, sync them immediately so
    // newly registered subscriptions respect existing disabled types.
    if (prefs) {
      await this.sync({ pubkey, prefs });
    }
  }

  async sync({ pubkey, prefs }: PushContext): Promise<void> {
    const client = this.client;
    const baseId = localStorage.getItem(SUBSCRIPTION_ID_KEY);
    if (!client || !baseId || !prefs) return;

    const onlyFollowing = prefs.onlyFollowing === true;

    await Promise.allSettled(
      NOTIFICATION_TEMPLATES.map((tmpl) => {
        const prefKey = TEMPLATE_ID_TO_PREF_KEY[tmpl.id];
        // Default to active when the preference is absent
        const isActive = prefKey ? prefs[prefKey] !== false : true;

        return client.updateSubscription({
          subscription_id: `${baseId}-${tmpl.id}`,
          domain: this.domain,
          updates: {
            is_active: isActive,
            filter: templateFilter(tmpl.kinds, pubkey, onlyFollowing),
            // Re-send the notification template so text improvements reach
            // subscriptions registered before the template changed.
            notification: {
              title: tmpl.title,
              body: tmpl.body,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
            },
          },
        }).catch((err) => {
          console.error(`[push] Failed to update ${tmpl.id} (is_active=${isActive}):`, err);
        });
      }),
    );
  }

  async disable(): Promise<void> {
    const client = this.client;
    const baseId = localStorage.getItem(SUBSCRIPTION_ID_KEY);

    if (client && baseId) {
      await Promise.allSettled(
        NOTIFICATION_TEMPLATES.map((tmpl) =>
          client.deleteSubscription({
            subscription_id: `${baseId}-${tmpl.id}`,
            domain: this.domain,
          }).catch((err) => console.error(`[push] Failed to delete ${tmpl.id}:`, err)),
        ),
      );
    }

    const pushSub = this.pushSubscription;
    if (pushSub) {
      try {
        await pushSub.unsubscribe();
      } catch { /* ignore */ }
      this.pushSubscription = null;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.client?.destroy();
    this.client = null;
  }
}
