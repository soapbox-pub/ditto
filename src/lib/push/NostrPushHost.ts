/**
 * Web Push transport, backed by a nostr-push service.
 *
 * The service is a napp host at a distance: it takes the same
 * `NappSubscription[]` Tenna does, watches its relays for matches, and pushes
 * the same `napp.push.payload` — the raw event — through the browser's push
 * service to `public/sw.js`, which renders it exactly as it would under Tenna.
 *
 * This host is the client half. It registers the service worker, subscribes
 * the browser to Web Push with a VAPID key it generates and keeps itself (the
 * service holds none of its own, and signs our pushes with the private half we
 * give it), registers that connection with `create`, and hands over the
 * subscriptions with `set`. The service forgets a client after 30 days without
 * contact, so `keepAlive()` pings it once a day.
 *
 * RPC is signed with an ephemeral per-device key (see `NostrPushClient`), so
 * the user's own signer is never prompted.
 *
 * Caveat worth knowing: the service matches against the firehose of its own
 * relays and ignores the ones a subscription names, so an event that never
 * reaches those relays is never pushed.
 */

import { NostrPushClient, NostrPushRpcError } from '@/lib/nostrPush';
import type { NappSubscription } from '@/lib/push/napp';
import { registerPushWorker } from '@/lib/push/serviceWorker';
import type { PushHost, PushSetOptions } from '@/lib/push/types';

/** Relays the nostr-push service reads requests from. */
const RPC_RELAYS = [
  'wss://relay.ditto.pub/',
  'wss://relay.dreamith.to/',
];

// localStorage keys
/** This device's VAPID key pair, as `{ publicKey, privateKey }` in base64url. */
const VAPID_KEY = 'ditto-push-vapid';
/** The push endpoint last registered with `create`, so a rotated one is re-registered. */
const REGISTERED_ENDPOINT_KEY = 'ditto-push-endpoint';
/** When the service last heard from us (ms). */
const LAST_CONTACT_KEY = 'ditto-push-last-contact';

/** Keys the pre-napp nostr-push client left behind. Their presence means "migrate". */
const LEGACY_SUBSCRIPTION_ID_KEY = 'ditto-push-subscription-id';
const LEGACY_VAPID_KEY = 'ditto-push-vapid-key';

/** Ping no more often than this. The service expires clients after 30 days. */
const KEEPALIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface VapidKeyPair {
  /** Uncompressed P-256 point, the browser's `applicationServerKey`. */
  publicKey: string;
  /** Private scalar (JWK `d`), which the service signs our pushes with. */
  privateKey: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function sameBytes(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((byte, i) => byte === b[i]);
}

function readVapidKey(): VapidKeyPair | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(VAPID_KEY) ?? 'null') as Partial<VapidKeyPair> | null;
    if (typeof parsed?.publicKey === 'string' && typeof parsed.privateKey === 'string') {
      return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
    }
  } catch {
    // Unreadable; a fresh key replaces it.
  }
  return null;
}

async function generateVapidKey(): Promise<VapidKeyPair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  if (!jwk.d) throw new Error('VAPID key export is missing its private scalar');
  return { publicKey: base64UrlEncode(raw), privateKey: jwk.d };
}

function touchContact(): void {
  localStorage.setItem(LAST_CONTACT_KEY, String(Date.now()));
}

export class NostrPushHost implements PushHost {
  readonly transport = 'nostr-push' as const;
  readonly supported: boolean;
  readonly needsBrowserPermission = true;
  readonly usesServiceWorker = true;
  readonly followsSyncedSetting = false;

  private client: NostrPushClient | null = null;
  private registration: ServiceWorkerRegistration | null = null;
  private pushSubscription: PushSubscription | null = null;
  /**
   * Generated in `init()` so `set()` needs no async work before
   * `pushManager.subscribe()` — browsers require that call to be reachable
   * from the user gesture.
   */
  private vapid: VapidKeyPair | null = null;
  private destroyed = false;

  constructor(private readonly servicePubkey: string) {
    this.supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      !!globalThis.crypto?.subtle &&
      !!servicePubkey;
  }

  async init(): Promise<boolean> {
    if (!this.supported || this.destroyed) return false;

    try {
      const client = await NostrPushClient.create(this.servicePubkey, RPC_RELAYS);
      if (this.destroyed) {
        client.destroy();
        return false;
      }
      this.client = client;

      this.registration = await registerPushWorker();
      if (!this.registration || this.destroyed) return false;

      this.vapid = readVapidKey();
      if (!this.vapid) {
        this.vapid = await generateVapidKey();
        localStorage.setItem(VAPID_KEY, JSON.stringify(this.vapid));
      }
      if (this.destroyed) return false;

      if (localStorage.getItem(LEGACY_SUBSCRIPTION_ID_KEY)) {
        return await this.migrateLegacy();
      }

      // Returning user: adopt the existing browser subscription so the adapter
      // reports enabled without another round of consent — but only one made
      // with our key and registered with the service.
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
      const existing = await this.registration.pushManager.getSubscription();
      if (!existing || !this.isOurs(existing)) return false;
      if (localStorage.getItem(REGISTERED_ENDPOINT_KEY) !== existing.endpoint) return false;
      this.pushSubscription = existing;
      return true;
    } catch (err) {
      console.error('[push] nostr-push bring-up failed:', err);
      return false;
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof Notification === 'undefined') return 'denied';
    return Notification.requestPermission();
  }

  async set(subscriptions: NappSubscription[], { workerReady }: PushSetOptions): Promise<void> {
    // Nothing may be awaited before `subscribe()` in here: a network round
    // trip ahead of it breaks the user-gesture activation chain and throws
    // "DOMException: The operation is insecure" in strict browsers.
    const sub = await this.ensurePushSubscription();
    await workerReady;
    await this.withClient(sub, (client) => client.set(subscriptions));
  }

  async clear(): Promise<void> {
    try {
      await this.client?.deleteClient();
    } catch (err) {
      console.error('[push] Failed to delete nostr-push client:', err);
    }
    localStorage.removeItem(REGISTERED_ENDPOINT_KEY);
    localStorage.removeItem(LAST_CONTACT_KEY);

    const sub = this.pushSubscription ?? await this.registration?.pushManager.getSubscription();
    this.pushSubscription = null;
    try {
      await sub?.unsubscribe();
    } catch { /* ignore */ }
  }

  async keepAlive(): Promise<boolean> {
    const sub = this.pushSubscription;
    if (!this.client || !sub) return false;

    const last = Number(localStorage.getItem(LAST_CONTACT_KEY) ?? 0);
    if (Date.now() - last < KEEPALIVE_INTERVAL_MS) return false;

    // A client the service forgot comes back through `create`, but its
    // subscriptions went with it; saying so has the adapter set them again.
    return this.withClient(sub, (c) => c.ping());
  }

  destroy(): void {
    this.destroyed = true;
    this.client?.destroy();
    this.client = null;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private isOurs(sub: PushSubscription): boolean {
    return !!this.vapid && sameBytes(sub.options.applicationServerKey, base64UrlDecode(this.vapid.publicKey));
  }

  /** The browser's push subscription, made with our VAPID key. */
  private async ensurePushSubscription(): Promise<PushSubscription> {
    const vapid = this.vapid;
    const reg = this.registration;
    if (!vapid || !reg) throw new Error('nostr-push is not initialized — the service worker may still be loading');

    if (this.pushSubscription && this.isOurs(this.pushSubscription)) return this.pushSubscription;

    let sub = await reg.pushManager.getSubscription();
    if (sub && !this.isOurs(sub)) {
      // Made with another key — the old server's. A browser holds one
      // subscription per worker, so it has to go before ours can exist.
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlDecode(vapid.publicKey),
    });
    this.pushSubscription = sub;
    return sub;
  }

  /**
   * Run an RPC that needs this device registered, registering it first when
   * it isn't — never created, created for an endpoint the browser has since
   * rotated, or expired by the service. Resolves with whether it had to.
   */
  private async withClient(sub: PushSubscription, call: (client: NostrPushClient) => Promise<void>): Promise<boolean> {
    const client = this.client;
    if (!client) throw new Error('nostr-push client is not initialized');

    let registered = false;
    if (localStorage.getItem(REGISTERED_ENDPOINT_KEY) !== sub.endpoint) {
      await this.register(client, sub);
      registered = true;
    }
    try {
      await call(client);
    } catch (err) {
      if (!(err instanceof NostrPushRpcError) || !err.unknownClient) throw err;
      await this.register(client, sub);
      registered = true;
      await call(client);
    }
    touchContact();
    return registered;
  }

  private async register(client: NostrPushClient, sub: PushSubscription): Promise<void> {
    const vapid = this.vapid;
    const { endpoint, keys } = sub.toJSON();
    if (!vapid || !endpoint || !keys?.p256dh || !keys?.auth) {
      throw new Error('PushSubscription is missing its endpoint or keys');
    }
    await client.createClient({
      method: 'web',
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      vapid_private_key: vapid.privateKey,
    });
    localStorage.setItem(REGISTERED_ENDPOINT_KEY, endpoint);
    touchContact();
  }

  /**
   * Move a browser registered with the pre-napp nostr-push server over to this
   * one, without asking again. Its push subscription was made with the old
   * server's VAPID key, so it is replaced; the old server then gets a 410 on
   * its next push and deletes its own records. Subscriptions are set by the
   * adapter's next sync, which a restored "enabled" triggers.
   */
  private async migrateLegacy(): Promise<boolean> {
    localStorage.removeItem(LEGACY_SUBSCRIPTION_ID_KEY);
    localStorage.removeItem(LEGACY_VAPID_KEY);

    const reg = this.registration;
    const client = this.client;
    if (!reg || !client) return false;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

    const old = await reg.pushManager.getSubscription();
    if (!old) return false;

    try {
      const sub = await this.ensurePushSubscription();
      await this.register(client, sub);
      return true;
    } catch (err) {
      console.warn('[push] Could not move this browser to the new push service:', err);
      return false;
    }
  }
}
