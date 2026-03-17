/**
 * nostr-push RPC client
 *
 * Sends RPC calls to the nostr-push server via encrypted Nostr events
 * (kind 25742, NIP-44) and awaits a confirmation response.
 *
 * Uses an ephemeral keypair (generated once, persisted in localStorage)
 * to avoid prompting the user's signer for every RPC call.
 *
 * Protocol:
 *   Request:  kind 25742, tags [["p", serverPubkey]]
 *             content: nip44Encrypt(serverPubkey, JSON.stringify({ method, params, request_id }))
 *
 *   Response: kind 25742, tags [["p", clientPubkey]], authored by serverPubkey
 *             content: nip44Encrypt(clientPubkey, JSON.stringify({ request_id, success, error? }))
 */

import { nip44, generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// ─── Ephemeral device key ─────────────────────────────────────────────────────

const DEVICE_KEY_STORAGE = 'ditto-push-device-key';

/**
 * Get or generate a persistent ephemeral key for this device.
 * Used to sign nostr-push RPC events without prompting the user's signer.
 */
function getDeviceSecretKey(): Uint8Array {
  const stored = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (stored) {
    return hexToBytes(stored);
  }
  const sk = generateSecretKey();
  localStorage.setItem(DEVICE_KEY_STORAGE, bytesToHex(sk));
  return sk;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebPushSubscription {
  type: 'web';
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

export interface RegisterSubscriptionParams {
  subscription_id: string;
  domain: string;
  filter: {
    kinds?: number[];
    authors?: string[];
    '#p'?: string[];
    '#t'?: string[];
    since?: number;
    until?: number;
  };
  notification: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
  };
  push_subscription: WebPushSubscription;
}

export interface DeleteSubscriptionParams {
  subscription_id: string;
  domain: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a browser PushSubscription to the flat structure nostr-push expects. */
export function serializePushSubscription(sub: PushSubscription): WebPushSubscription {
  const keys = sub.toJSON().keys;
  if (!keys?.p256dh || !keys?.auth) {
    throw new Error('PushSubscription is missing p256dh or auth keys');
  }
  return {
    type: 'web',
    endpoint: sub.endpoint,
    p256dh_key: keys.p256dh,
    auth_key: keys.auth,
  };
}

/** Convert a base64url string to a Uint8Array (for applicationServerKey). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ─── Client ───────────────────────────────────────────────────────────────────

/** How long to wait for a server response before giving up. */
const RESPONSE_TIMEOUT_MS = 15_000;

export class NostrPushClient {
  private pool: SimplePool;
  private secretKey: Uint8Array;
  private publicKey: string;

  constructor(
    /** The nostr-push server's pubkey (hex). */
    private readonly serverPubkey: string,
    /** Relays to publish RPC calls to. */
    private readonly relays: string[],
  ) {
    this.pool = new SimplePool();
    this.secretKey = getDeviceSecretKey();
    this.publicKey = getPublicKey(this.secretKey);
  }

  /**
   * Get the VAPID public key for a domain.
   * Must be called before pushManager.subscribe() so the browser gets
   * the correct applicationServerKey for this domain.
   */
  async getVapidKey(domain: string): Promise<string> {
    const result = await this.send('get_vapid_key', { domain });
    const vapidKey = (result as { vapid_public_key?: string })?.vapid_public_key;
    if (!vapidKey) throw new Error('nostr-push: server did not return a VAPID key');
    return vapidKey;
  }

  /** Register (or replace) a push subscription. */
  async registerSubscription(params: RegisterSubscriptionParams): Promise<void> {
    await this.send('register_subscription', params);
  }

  /** Delete a push subscription by its ID. */
  async deleteSubscription(params: DeleteSubscriptionParams): Promise<void> {
    await this.send('delete_subscription', params);
  }

  /** Close the relay pool. */
  destroy(): void {
    this.pool.close(this.relays);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async send(
    method: string,
    params: object,
  ): Promise<unknown> {
    const request_id = crypto.randomUUID();

    // NIP-44 encrypt the payload to the server
    const conversationKey = nip44.v2.utils.getConversationKey(this.secretKey, this.serverPubkey);
    const encryptedContent = nip44.v2.encrypt(
      JSON.stringify({ method, params, request_id }),
      conversationKey,
    );

    const event = finalizeEvent(
      {
        kind: 25742,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', this.serverPubkey]],
        content: encryptedContent,
      },
      this.secretKey,
    );

    // Subscribe for the response BEFORE publishing so we don't miss a fast reply.
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.close();
        reject(new Error(`nostr-push: RPC timeout (${method})`));
      }, RESPONSE_TIMEOUT_MS);

      const responseConversationKey = nip44.v2.utils.getConversationKey(this.secretKey, this.serverPubkey);

      const sub = this.pool.subscribeMany(
        this.relays,
        [{
          kinds: [25742],
          authors: [this.serverPubkey],
          '#p': [this.publicKey],
          since: Math.floor(Date.now() / 1000) - 5,
        }],
        {
          onevent: (responseEvent) => {
            try {
              const decrypted = nip44.v2.decrypt(responseEvent.content, responseConversationKey);
              const response = JSON.parse(decrypted) as {
                request_id: string;
                success: boolean;
                error?: string;
                result?: unknown;
              };

              if (response.request_id !== request_id) return;

              clearTimeout(timeout);
              sub.close();

              if (response.success) {
                resolve(response.result);
              } else {
                reject(new Error(response.error ?? 'RPC call failed'));
              }
            } catch {
              // Ignore events we can't decrypt
            }
          },
        },
      );
    });

    // Publish to relays — at least one must accept
    console.debug('[nostr-push] Publishing RPC event', { method, request_id, relays: this.relays, eventId: event.id });
    await Promise.any(this.relays.map((url) => this.pool.publish([url], event))).catch(() => {
      throw new Error('nostr-push: failed to publish RPC event to any relay');
    });
    console.debug('[nostr-push] RPC event published, awaiting response...');

    return responsePromise;
  }
}
