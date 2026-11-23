/**
 * NIP-46 remote signer, replacing Nostrify's `NConnectSigner`, whose per-RPC
 * subscriptions missed ephemeral kind-24133 responses, left zombie subs, and
 * retried explicit rejections. This keeps ONE session-lived response
 * subscription and dispatches by request id. Requests are NIP-44; responses
 * fall back to NIP-04 for legacy bunkers.
 *
 * Each RPC keeps ONE request id and is re-published while unanswered: relays
 * don't store ephemeral 24133, so a sleeping signer only sees a copy published
 * after it reconnects. Copies are the SAME signed event for the first minutes,
 * because Amber drops a 24133 whose id it has handled but processes a fresh
 * one from scratch, and a once-only approval remembers nothing, so a new event
 * for a request it just answered prompts the user again (the answer is still
 * in flight when the user comes back and a reopen resends). After that a copy
 * is re-signed, since by then the answer itself may have been lost, and only a
 * new id makes such a signer look again. A signature waits minutes, since the
 * user may have to go approve it.
 *
 * Returning to the app is the exception: a request still unanswered
 * `RESUME_REFRESH_MS` after the user comes back (from the signer, usually) is
 * re-signed at once. A signer that was suspended answers within a second of
 * waking, so the wait spares one that merely has its answer in flight; past it,
 * the signer most likely dropped its socket and resubscribed with `since: now`
 * (nak does), which filters out every copy carrying the first publish's
 * created_at, and relays dedupe a byte-identical copy anyway.
 *
 * Every copy can cost the signer a wake-up (a push, for Clave), so copies back
 * off, in-flight RPCs are capped, and user-visible work goes ahead of decrypts.
 */

import { type NostrEvent, type NostrSigner, NSecSigner } from '@nostrify/nostrify';
import type { NostrConnectRequest, NostrConnectResponse } from '@nostrify/types';
import { nip19 } from 'nostr-tools';
import { verifyEvent } from 'nostr-tools/pure';

import type { BtcSigner } from '@/lib/bitcoin-signers';
import { getNip46Transport, type Nip46Transport } from '@/lib/nip46Transport';
import { minePow } from '@/lib/pow';

export interface Nip46SignerOpts {
  transport: Nip46Transport;
  bunkerPubkey: string;
  /** Local ephemeral client signer (the pairing's client key). */
  clientSigner: NostrSigner;
  /**
   * The account the bunker signs for. `sign_event` refuses an event signed by
   * any other key. Pairing doesn't know it yet; there it's taken from the
   * first `get_public_key` answer instead.
   */
  userPubkey?: string;
  /** First re-publish of an unanswered request; later gaps double. Default 30s. */
  attemptTimeoutMs?: number;
  /** How many publishes a non-signing RPC gets before it fails. Default 2. */
  attempts?: number;
  /** How long a `sign_event` waits for the user to approve it. Default 5 min. */
  signTimeoutMs?: number;
  /** RPCs published and awaiting an answer at once; the rest queue. Default 4. */
  maxInFlight?: number;
}

/**
 * Long enough to switch to the signer app, find the request and approve it.
 * Not longer: every copy carries the FIRST publish's created_at, and Amber
 * refuses a 24133 more than five minutes old.
 */
export const NIP46_SIGN_TIMEOUT_MS = 5 * 60_000;

const NIP46_KIND = 24133;

/** Re-publish gaps double from `attemptTimeoutMs` up to this multiple of it. */
const MAX_GAP_FACTOR = 4;

/** How long after the user returns an unanswered request waits before a re-signed copy. */
const RESUME_REFRESH_MS = 5_000;

/** Bulk work that may wait behind anything the user is looking at. */
const BACKGROUND_METHODS = new Set(['nip04_decrypt', 'nip44_decrypt']);

/** Thrown when the bunker answered with an explicit error. Never retried. */
class BunkerResponseError extends Error {}

/**
 * Text patterns marking a `sign_psbt` error as missing capability rather than a
 * transient failure (NIP-46 errors are unstructured strings).
 */
const CAPABILITY_ERROR_PATTERNS = [
  /unknown\s+(method|command)/i,
  /not\s+(implemented|supported|found)/i,
  /unsupported\s+method/i,
  /method\s+not\s+found/i,
  /invalid\s+method/i,
  /no\s+such\s+method/i,
];

function looksLikeCapabilityError(msg: string): boolean {
  return CAPABILITY_ERROR_PATTERNS.some((re) => re.test(msg));
}

function sameTags(a: unknown, b: string[][]): boolean {
  return (
    Array.isArray(a) &&
    a.length === b.length &&
    a.every((tag, i) =>
      Array.isArray(tag) && tag.length === b[i].length && tag.every((value, j) => value === b[i][j]),
    )
  );
}

interface PendingRpc {
  resolve: (response: NostrConnectResponse) => void;
  method: string;
}

export class Nip46Signer implements NostrSigner, BtcSigner {
  private readonly transport: Nip46Transport;
  private readonly bunkerPubkey: string;
  private readonly clientSigner: NostrSigner;
  private readonly attemptTimeoutMs: number;
  private readonly attempts: number;
  private readonly signTimeoutMs: number;
  private readonly maxInFlight: number;

  private inFlight = 0;
  /** RPCs waiting for a slot: foreground ones ahead of background ones. */
  private readonly waiting: { start: () => void; background: boolean }[] = [];
  private readonly pending = new Map<string, PendingRpc>();
  /** Re-publish of each unanswered request, by request id; `fresh` re-signs it. */
  private readonly republish = new Map<string, (relay?: string, fresh?: boolean) => Promise<void>>();
  private readonly abort = new AbortController();
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;
  private clientPubkey: string | undefined;
  private userPubkey: string | undefined;

  /** Resolves once the persistent response subscription is installed. */
  private readonly ready: Promise<void>;

  constructor(opts: Nip46SignerOpts) {
    this.transport = opts.transport;
    this.bunkerPubkey = opts.bunkerPubkey;
    this.clientSigner = opts.clientSigner;
    this.userPubkey = opts.userPubkey;
    this.attemptTimeoutMs = opts.attemptTimeoutMs ?? 30_000;
    this.attempts = opts.attempts ?? 2;
    this.signTimeoutMs = opts.signTimeoutMs ?? NIP46_SIGN_TIMEOUT_MS;
    this.maxInFlight = opts.maxInFlight ?? 4;
    this.ready = this.subscribe();
    // A copy sent on a socket that then dropped never reached the relay.
    const off = this.transport.onReopen?.((relay) => this.resendPending(relay));
    if (off) this.abort.signal.addEventListener('abort', off, { once: true });
    const offResume = this.transport.onResume?.(() => this.refreshAfterResume());
    if (offResume) this.abort.signal.addEventListener('abort', offResume, { once: true });
  }

  /**
   * Re-sign every request that was already unanswered when the user came back
   * and still is `RESUME_REFRESH_MS` later. Ones sent after the return are left
   * alone: a fresh copy of those could only prompt a manual signer twice.
   */
  private refreshAfterResume(): void {
    const outstanding = [...this.republish.keys()];
    if (outstanding.length === 0) return;
    clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      for (const id of outstanding) {
        const publish = this.republish.get(id);
        if (!publish) continue;
        void publish(undefined, true).catch(() => undefined);
      }
    }, RESUME_REFRESH_MS);
  }

  /**
   * End the response subscription and fail every RPC still waiting. A signer
   * left open keeps its subscription on the shared transport for the session.
   */
  close(): void {
    if (this.abort.signal.aborted) return;
    this.abort.abort();
    clearTimeout(this.resumeTimer);
    const pending = [...this.pending];
    this.pending.clear();
    for (const [id, rpc] of pending) rpc.resolve({ id, result: '', error: 'NIP-46 signer closed' });
  }

  /** Re-publish every unanswered request now (same ids, so no duplicate prompts). */
  resendPending(relay?: string): void {
    for (const publish of this.republish.values()) void publish(relay).catch(() => undefined);
  }

  private async acquireSlot(method: string): Promise<void> {
    if (this.inFlight < this.maxInFlight) {
      this.inFlight++;
      return;
    }
    const background = BACKGROUND_METHODS.has(method);
    await new Promise<void>((start) => {
      const entry = { start, background };
      const at = background ? -1 : this.waiting.findIndex((w) => w.background);
      if (at === -1) this.waiting.push(entry);
      else this.waiting.splice(at, 0, entry);
    });
  }

  private releaseSlot(): void {
    const next = this.waiting.shift();
    if (next) next.start();
    else this.inFlight--;
  }

  /** Open the session-lived response subscription and pump it forever. */
  private async subscribe(): Promise<void> {
    this.clientPubkey = await this.clientSigner.getPublicKey();
    const iter = this.transport.req(
      [{ kinds: [NIP46_KIND], authors: [this.bunkerPubkey], '#p': [this.clientPubkey] }],
      { signal: this.abort.signal },
    );
    // Detached pump for the signer's lifetime; the transport ends it when `close()` aborts.
    void (async () => {
      for await (const msg of iter) {
        if (msg[0] === 'EVENT') await this.dispatch(msg[2]);
      }
    })().catch(() => undefined);
  }

  private async dispatch(event: NostrEvent): Promise<void> {
    // The filter asks relays for this author; a relay that ignores it is not trusted to.
    if (event.pubkey !== this.bunkerPubkey) return;
    let plaintext: string;
    try {
      plaintext = await this.clientSigner.nip44!.decrypt(event.pubkey, event.content);
    } catch {
      // Legacy bunkers may answer NIP-04 even to a NIP-44 request.
      try {
        plaintext = await this.clientSigner.nip04!.decrypt(event.pubkey, event.content);
      } catch {
        return; // Not addressed to us / undecryptable noise.
      }
    }
    let response: NostrConnectResponse;
    try {
      response = JSON.parse(plaintext) as NostrConnectResponse;
    } catch {
      return;
    }
    if (typeof response?.id !== 'string') return;
    const rpc = this.pending.get(response.id);
    if (!rpc) return; // Stale/foreign: settled already (a re-published copy's second answer).
    this.pending.delete(response.id);
    rpc.resolve(response);
  }

  /**
   * One RPC under one request id, re-published every `attemptTimeoutMs` while
   * unanswered. A bunker error (a rejection) fails at once and is never re-asked.
   */
  private async cmd(method: string, params: string[]): Promise<string> {
    await this.ready;
    await this.acquireSlot(method);
    try {
      return await this.run(method, params);
    } finally {
      this.releaseSlot();
    }
  }

  private async run(method: string, params: string[]): Promise<string> {
    // Queued behind a slot when the signer was closed.
    if (this.abort.signal.aborted) throw new Error('NIP-46 signer closed');
    const request: NostrConnectRequest = { id: crypto.randomUUID(), method, params };
    const budgetMs = method === 'sign_event' ? this.signTimeoutMs : this.attemptTimeoutMs * this.attempts;
    const t0 = Date.now();
    const deadline = t0 + budgetMs;
    const response = new Promise<NostrConnectResponse>((resolve) => {
      this.pending.set(request.id, { resolve, method });
    });
    // One signed event per `refreshMs` (see the header): a copy of an event this old
    // is more likely answering a LOST answer than a missed request, and only a new
    // id gets a signer that dedupes to look again. A failed sign is retried by the next copy.
    const refreshMs = this.attemptTimeoutMs * MAX_GAP_FACTOR;
    let signed: { at: number; event: Promise<NostrEvent> } | undefined;
    const sign = async (): Promise<NostrEvent> =>
      this.clientSigner.signEvent(await minePow({
        kind: NIP46_KIND,
        content: await this.clientSigner.nip44!.encrypt(this.bunkerPubkey, JSON.stringify(request)),
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', this.bunkerPubkey]],
      }, await this.clientSigner.getPublicKey()));
    const publish = async (relay?: string, fresh = false) => {
      if (!signed || fresh || Date.now() - signed.at >= refreshMs) {
        const at = Date.now();
        const event = sign().catch((err: unknown) => {
          if (signed?.at === at) signed = undefined;
          throw err;
        });
        signed = { at, event };
      }
      const event = await signed.event;
      await this.transport.event(event, { signal: AbortSignal.timeout(this.attemptTimeoutMs), relay });
    };
    this.republish.set(request.id, publish);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let lastErr: unknown;
      let gap = this.attemptTimeoutMs;
      for (;;) {
        try {
          await publish();
          lastErr = undefined;
        } catch (err) {
          lastErr = err;
        }
        const remaining = deadline - Date.now();
        const wait = Math.min(gap, remaining);
        // A timer can fire a millisecond before Date.now() reaches the deadline;
        // the wait that was clamped to it is the last one regardless.
        const last = gap >= remaining;
        gap = Math.min(gap * 2, this.attemptTimeoutMs * MAX_GAP_FACTOR);
        const outcome = await Promise.race([
          response,
          new Promise<undefined>((r) => {
            timer = setTimeout(() => r(undefined), Math.max(0, wait));
          }),
        ]);
        clearTimeout(timer);
        if (outcome) {
          const { result, error } = outcome;
          if (error) {
            throw new BunkerResponseError(error);
          }
          if (typeof result !== 'string') throw new BunkerResponseError('malformed NIP-46 response');
          return result;
        }
        if (last || Date.now() >= deadline) {
          throw lastErr ?? new Error(`NIP-46 ${method} timed out after ${budgetMs}ms`);
        }
      }
    } finally {
      clearTimeout(timer);
      this.pending.delete(request.id);
      this.republish.delete(request.id);
    }
  }

  async getPublicKey(): Promise<string> {
    const pubkey = await this.cmd('get_public_key', []);
    this.userPubkey ??= pubkey;
    return pubkey;
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const result = await this.cmd('sign_event', [JSON.stringify(event)]);
    const signed = JSON.parse(result) as NostrEvent;
    if (
      typeof signed?.id !== 'string' ||
      typeof signed?.pubkey !== 'string' ||
      typeof signed?.sig !== 'string'
    ) {
      throw new Error('NIP-46 sign_event returned a malformed event');
    }
    // What was asked for, by this account, validly signed: anything else would be published as-is.
    if (
      signed.kind !== event.kind ||
      signed.content !== event.content ||
      signed.created_at !== event.created_at ||
      !sameTags(signed.tags, event.tags) ||
      (this.userPubkey !== undefined && signed.pubkey !== this.userPubkey) ||
      !verifyEvent(signed)
    ) {
      throw new Error('NIP-46 sign_event returned an event that is not the one requested');
    }
    return signed;
  }

  async getRelays(): Promise<Record<string, { read: boolean; write: boolean }>> {
    const result = await this.cmd('get_relays', []);
    return JSON.parse(result) as Record<string, { read: boolean; write: boolean }>;
  }

  readonly nip04 = {
    encrypt: (pubkey: string, plaintext: string): Promise<string> =>
      this.cmd('nip04_encrypt', [pubkey, plaintext]),
    decrypt: (pubkey: string, ciphertext: string): Promise<string> =>
      this.cmd('nip04_decrypt', [pubkey, ciphertext]),
  };

  readonly nip44 = {
    encrypt: (pubkey: string, plaintext: string): Promise<string> =>
      this.cmd('nip44_encrypt', [pubkey, plaintext]),
    decrypt: (pubkey: string, ciphertext: string): Promise<string> =>
      this.cmd('nip44_decrypt', [pubkey, ciphertext]),
  };

  /** `connect` handshake used when pairing via a bunker:// URI. */
  connect(secret?: string): Promise<string> {
    const params = [this.bunkerPubkey];
    if (secret) params.push(secret);
    return this.cmd('connect', params);
  }

  ping(): Promise<string> {
    return this.cmd('ping', []);
  }

  /**
   * NIP-46 `sign_psbt`. Capability failures are re-wrapped to flip the UI into
   * the unsupported state; other errors propagate unchanged.
   */
  async signPsbt(psbtHex: string): Promise<string> {
    try {
      return await this.cmd('sign_psbt', [psbtHex]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (looksLikeCapabilityError(msg)) {
        throw new Error(
          `Your remote signer doesn't support sending Bitcoin. Update to a signer that supports Bitcoin (PSBT) signing. (${msg})`,
        );
      }
      throw error;
    }
  }
}

/** A bunker login's NIP-46 session. */
export interface Nip46Session {
  /** The login's id. */
  id: string;
  /** The account's pubkey. */
  pubkey: string;
  bunkerPubkey: string;
  clientNsec: string;
  relays: string[];
}

/** One signer per bunker login, by login id, with the transport it was made for. */
const sessionSigners = new Map<string, { transportKey: string; signer: Nip46Signer }>();

/**
 * The app-wide signer for a bunker login. Every caller (the pool's AUTH
 * signer, `useCurrentUser`) shares it: each signer is a response
 * subscription, and each subscription decrypts every response.
 */
export function getNip46SessionSigner(session: Nip46Session): Nip46Signer {
  const transportKey = `${session.bunkerPubkey}|${[...session.relays].sort().join(',')}`;
  const cached = sessionSigners.get(session.id);
  if (cached?.transportKey === transportKey) return cached.signer;
  cached?.signer.close();

  const clientSk = nip19.decode(session.clientNsec) as { type: 'nsec'; data: Uint8Array };
  const signer = new Nip46Signer({
    transport: getNip46Transport(session.bunkerPubkey, session.relays),
    bunkerPubkey: session.bunkerPubkey,
    clientSigner: new NSecSigner(clientSk.data),
    userPubkey: session.pubkey,
  });
  sessionSigners.set(session.id, { transportKey, signer });
  return signer;
}

/** Close and forget the signers of every login not in `loginIds`. */
export function retainNip46SessionSigners(loginIds: Iterable<string>): void {
  const keep = new Set(loginIds);
  for (const [id, { signer }] of sessionSigners) {
    if (keep.has(id)) continue;
    signer.close();
    sessionSigners.delete(id);
  }
}
