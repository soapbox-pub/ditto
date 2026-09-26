/**
 * nostr-push RPC client
 *
 * Talks to a nostr-push service (see its NIP.md) over encrypted Nostr events. The service takes Tenna's
 * `NappSubscription[]` unchanged and pushes Tenna's `napp.push.payload`
 * unchanged, which is what lets Web Push be just another napp transport.
 *
 * Uses an ephemeral keypair (generated once per device) so the user's own
 * signer is never prompted. The key's pubkey is this device's identity to the
 * service: there is one client record per pubkey.
 *
 * Protocol:
 *   Request:  kind 25742, tags [["p", servicePubkey]]
 *             content: nip44Encrypt(servicePubkey, JSON.stringify({ id, method, params }))
 *
 *   Response: kind 25742, tags [["p", clientPubkey]], authored by servicePubkey
 *             content: nip44Encrypt(clientPubkey, JSON.stringify({ id, result } | { id, error }))
 */

import { nip44, generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

import type { NappSubscription } from '@/lib/push/napp';
import { secureStorage } from '@/lib/secureStorage';

// ─── Ephemeral device key ─────────────────────────────────────────────────────

const DEVICE_KEY_STORAGE = 'ditto-push-device-key';

/**
 * Get or generate a persistent ephemeral key for this device.
 * Used to sign nostr-push RPC events without prompting the user's signer.
 *
 * Routed through \`secureStorage\` so native builds keep the key in the iOS
 * Keychain / Android KeyStore. Web falls back to localStorage (the key is
 * ephemeral and per-device, so a plaintext copy only leaks which Nostr
 * events this device wants pushed — not the user's identity).
 */
async function getDeviceSecretKey(): Promise<Uint8Array> {
  const stored = await secureStorage.getItem(DEVICE_KEY_STORAGE);
  if (stored) {
    return hexToBytes(stored);
  }
  const sk = generateSecretKey();
  await secureStorage.setItem(DEVICE_KEY_STORAGE, bytesToHex(sk));
  return sk;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** How the service reaches this client. Only Web Push is used from the page. */
export interface WebPushConnection {
  method: 'web';
  /** `PushSubscription.toJSON().endpoint`. */
  endpoint: string;
  /** `PushSubscription.toJSON().keys.p256dh`. */
  p256dh: string;
  /** `PushSubscription.toJSON().keys.auth`. */
  auth: string;
  /** Private scalar (JWK `d`) of the VAPID key the browser subscribed with. */
  vapid_private_key: string;
}

/** Error message the service answers `set`, `get` and `ping` with before `create`. */
const UNKNOWN_CLIENT = 'unknown client';

export class NostrPushRpcError extends Error {
  /** Whether the service has no record of this client (never created, or expired). */
  get unknownClient(): boolean {
    return this.message.startsWith(UNKNOWN_CLIENT);
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

/** How long to wait for a service response before giving up. */
const RESPONSE_TIMEOUT_MS = 15_000;

export class NostrPushClient {
  private pool: SimplePool;
  private secretKey: Uint8Array;
  private publicKey: string;

  private constructor(
    /** The nostr-push service's pubkey (hex). */
    private readonly servicePubkey: string,
    /** Relays the service reads requests from. */
    private readonly relays: string[],
    secretKey: Uint8Array,
  ) {
    this.pool = new SimplePool();
    this.secretKey = secretKey;
    this.publicKey = getPublicKey(secretKey);
  }

  /**
   * Create a new client, loading (or generating) the device key from
   * platform-appropriate secure storage.
   */
  static async create(servicePubkey: string, relays: string[]): Promise<NostrPushClient> {
    const secretKey = await getDeviceSecretKey();
    return new NostrPushClient(servicePubkey, relays, secretKey);
  }

  /** Register, or replace, how this device is reached. Keeps its subscriptions. */
  async createClient(connection: WebPushConnection): Promise<void> {
    await this.send('create', connection);
  }

  /** Remove this device and its subscriptions. Not an error if it doesn't exist. */
  async deleteClient(): Promise<void> {
    await this.send('delete');
  }

  /** Replace this device's subscriptions. An empty list clears them. */
  async set(subscriptions: NappSubscription[]): Promise<void> {
    await this.send('set', { subscriptions });
  }

  /** The subscriptions as stored, after the service's normalization. */
  async get(): Promise<NappSubscription[]> {
    const result = await this.send('get') as { subscriptions?: NappSubscription[] } | undefined;
    return result?.subscriptions ?? [];
  }

  /** Reset the service's 30-day expiry clock. */
  async ping(): Promise<void> {
    await this.send('ping');
  }

  /** Close the relay pool. */
  destroy(): void {
    this.pool.close(this.relays);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async send(method: string, params?: object): Promise<unknown> {
    const id = crypto.randomUUID();
    const conversationKey = nip44.v2.utils.getConversationKey(this.secretKey, this.servicePubkey);

    const event = finalizeEvent(
      {
        kind: 25742,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', this.servicePubkey]],
        content: nip44.v2.encrypt(JSON.stringify({ id, method, params }), conversationKey),
      },
      this.secretKey,
    );

    // Subscribe for the response BEFORE publishing so we don't miss a fast reply.
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.close();
        reject(new Error(`nostr-push: RPC timeout (${method})`));
      }, RESPONSE_TIMEOUT_MS);

      const sub = this.pool.subscribeMany(
        this.relays,
        [{
          kinds: [25742],
          authors: [this.servicePubkey],
          '#p': [this.publicKey],
          since: Math.floor(Date.now() / 1000) - 5,
        }],
        {
          onevent: (responseEvent) => {
            let response: { id?: string; result?: unknown; error?: string };
            try {
              response = JSON.parse(nip44.v2.decrypt(responseEvent.content, conversationKey));
            } catch {
              return; // Not for us, or not readable.
            }
            if (response.id !== id) return;

            clearTimeout(timeout);
            sub.close();

            if (typeof response.error === 'string') {
              reject(new NostrPushRpcError(response.error));
            } else {
              resolve(response.result);
            }
          },
        },
      );
    });

    // Publish to relays — at least one must accept
    try {
      await Promise.any(this.pool.publish(this.relays, event));
    } catch {
      // Don't leave the response wait running for a request nobody received.
      responsePromise.catch(() => {});
      throw new Error('nostr-push: failed to publish RPC event to any relay');
    }

    return responsePromise;
  }
}
