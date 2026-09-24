import { NRelay1, type NostrEvent, type NRelay1Opts } from '@nostrify/nostrify';
import type { NostrRelayMsg } from '@nostrify/types';

/**
 * Which relays Ditto may connect to, and which may get a NIP-42 AUTH.
 *
 * The relay pool is created once, outside React, so the policy lives here as
 * module state: the pool reads it synchronously on every connection and AUTH
 * challenge, and components keep it up to date.
 */

/** When to answer a relay's NIP-42 AUTH challenge. */
export type RelayAuthPolicy = 'never' | 'mine' | 'ask' | 'always';

export const RELAY_AUTH_POLICIES: readonly RelayAuthPolicy[] = ['never', 'mine', 'ask', 'always'];

export const DEFAULT_RELAY_AUTH_POLICY: RelayAuthPolicy = 'mine';

/** Normalize a relay URL for comparison. Returns undefined if it isn't a ws(s) URL. */
export function normalizeRelayUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

/**
 * What identifies a relay for blocking: host, port and path, without the
 * scheme or a trailing slash. `ws://x`, `wss://x/` and `WSS://X` are one relay,
 * so a block can't be sidestepped by spelling the URL differently.
 */
export function relayMatchKey(url: string): string | undefined {
  const href = normalizeRelayUrl(url);
  if (!href) return undefined;
  const parsed = new URL(href);
  return `${parsed.host}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
}

// ---------------------------------------------------------------------------
// Blocked relays (NIP-51 kind 10006)
// ---------------------------------------------------------------------------

/** Cache key for an account's blocked relays. */
function blockedCacheKey(pubkey: string): string {
  return `nostr:blocked-relays:${pubkey}`;
}

/** Blocked relays, by {@link relayMatchKey}, with the URL as written. */
let blocked = new Map<string, string>();

/**
 * Relays that can't be blocked, by {@link relayMatchKey}: the relays of
 * logged-in accounts' remote signers (NIP-46), without which signing would
 * silently stop working.
 */
let exempt = new Set<string>();

const blockedListeners = new Set<(changed: string[]) => void>();

/** Build a blocked map from URLs, dropping invalid ones. */
function toBlockedMap(urls: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const url of urls) {
    const href = normalizeRelayUrl(url);
    const key = href && relayMatchKey(href);
    if (href && key && !map.has(key)) map.set(key, href);
  }
  return map;
}

/** Replace the blocked set and tell listeners which relays changed. */
function replaceBlocked(next: Map<string, string>): void {
  const changed = [
    ...[...next.keys()].filter((key) => !blocked.has(key)),
    ...[...blocked.keys()].filter((key) => !next.has(key)),
  ].filter((key) => !exempt.has(key));
  blocked = next;
  if (changed.length) {
    for (const listener of blockedListeners) listener(changed);
  }
}

/**
 * Subscribe to changes in which relays are blocked, with the
 * {@link relayMatchKey}s that were blocked or unblocked. The pool uses this to
 * drop connections it already has.
 */
export function onBlockedRelaysChange(listener: (changed: string[]) => void): () => void {
  blockedListeners.add(listener);
  return () => blockedListeners.delete(listener);
}

interface BlockedRelaysCache {
  /** Every blocked relay, public and private. */
  relays: string[];
  /** The private entries, kept so they still apply while they can't be decrypted. */
  private: string[];
}

function readBlockedCache(pubkey: string): BlockedRelaysCache {
  try {
    const cached: unknown = JSON.parse(localStorage.getItem(blockedCacheKey(pubkey)) ?? 'null');
    if (cached && typeof cached === 'object') {
      const { relays, private: priv } = cached as Record<string, unknown>;
      const strings = (value: unknown) => Array.isArray(value)
        ? value.filter((u: unknown): u is string => typeof u === 'string')
        : [];
      return { relays: strings(relays), private: strings(priv) };
    }
  } catch {
    // Ignore a corrupt cache; the list is re-fetched.
  }
  return { relays: [], private: [] };
}

/**
 * Set the relays that can't be blocked. See {@link exempt}. Listeners hear
 * about blocked relays that became exempt or stopped being exempt, so a
 * signer's relay is reconnected, or a logged-out one's connection dropped.
 */
export function setUnblockableRelays(urls: string[]): void {
  const next = new Set(urls.map(relayMatchKey).filter((k): k is string => !!k));
  const changed = [...blocked.keys()].filter((key) => exempt.has(key) !== next.has(key));
  exempt = next;
  if (changed.length) {
    for (const listener of blockedListeners) listener(changed);
  }
}

/**
 * Set the active account's blocked relays. They're cached per account so the
 * block applies from the first connection on the next launch, before the list
 * has been fetched.
 *
 * Pass `privateUrls` when the list's private entries were read, so they're
 * cached separately; see {@link getCachedPrivateBlockedRelays}. Omit it to
 * keep the private entries already cached.
 */
export function setBlockedRelays(pubkey: string | undefined, urls: string[], privateUrls?: string[]): void {
  replaceBlocked(toBlockedMap(urls));
  if (!pubkey) return;
  try {
    const cache: BlockedRelaysCache = {
      relays: [...blocked.values()],
      private: privateUrls
        ? privateUrls.map(normalizeRelayUrl).filter((u): u is string => !!u)
        : readBlockedCache(pubkey).private,
    };
    localStorage.setItem(blockedCacheKey(pubkey), JSON.stringify(cache));
  } catch {
    // Storage full or unavailable — the list still applies for this session.
  }
}

/**
 * The private blocked relays last read for an account. While the list's
 * private half can't be decrypted, these stand in for it, so relays blocked
 * privately stay blocked without resurrecting public entries since removed.
 */
export function getCachedPrivateBlockedRelays(pubkey: string): string[] {
  return readBlockedCache(pubkey).private;
}

/** Forget an account's cached blocked relays (on logout). The list is private. */
export function clearCachedBlockedRelays(pubkey: string): void {
  try {
    localStorage.removeItem(blockedCacheKey(pubkey));
  } catch {
    // Storage unavailable — nothing cached.
  }
}

/** Load the cached blocked relays for an account (on login or account switch). */
export function loadBlockedRelays(pubkey: string | undefined): void {
  replaceBlocked(toBlockedMap(pubkey ? readBlockedCache(pubkey).relays : []));
}

/** The active account's blocked relays. */
export function getBlockedRelays(): string[] {
  return [...blocked.values()];
}

/**
 * Whether the user has blocked a relay. Blocked relays are never connected to,
 * except a logged-in account's remote-signer relays.
 */
export function isRelayBlocked(url: string): boolean {
  if (!blocked.size) return false;
  const key = relayMatchKey(url);
  return key !== undefined && blocked.has(key) && !exempt.has(key);
}

/** Drop blocked relays from a list of URLs. */
export function withoutBlockedRelays(urls: string[]): string[] {
  return blocked.size ? urls.filter((url) => !isRelayBlocked(url)) : urls;
}

// ---------------------------------------------------------------------------
// "Ask" prompts
// ---------------------------------------------------------------------------

/** The user's answer to an AUTH prompt. */
export interface RelayAuthDecision {
  allowed: boolean;
  /** Remember the answer for this relay, on this device. */
  remember: boolean;
}

interface PendingAuthPrompt {
  url: string;
  resolve: (decision: RelayAuthDecision) => void;
  /** Declines the prompt if unanswered; started once the prompt is shown. */
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * How long a shown prompt waits for an answer before it's declined. A timeout
 * isn't an answer, so it isn't applied to the rest of the session.
 */
const PROMPT_TIMEOUT_MS = 60_000;

const queue: PendingAuthPrompt[] = [];
const listeners = new Set<() => void>();
/** Answers not remembered, applied for the rest of this session. */
const sessionAnswers = new Map<string, boolean>();
/** Snapshot for `useSyncExternalStore`; replaced whenever the queue changes. */
let snapshot: { url: string; total: number } | undefined;
/**
 * Relays whose prompt is shown inline by the page the user is on (e.g. the
 * relay's own feed), with a count of claimants. The floating prompt skips them.
 */
const claimed = new Map<string, number>();

function notify(): void {
  const floating = queue.filter((p) => !claimed.has(p.url));
  snapshot = floating[0] ? { url: floating[0].url, total: floating.length } : undefined;

  // Start the timeout for prompts now on screen: the floating card's, and
  // any shown inline. Prompts still waiting their turn don't expire.
  for (const prompt of queue) {
    if (!prompt.timer && (prompt === floating[0] || claimed.has(prompt.url))) {
      prompt.timer = setTimeout(() => removePrompt(prompt, { allowed: false, remember: false }), PROMPT_TIMEOUT_MS);
    }
  }

  for (const listener of listeners) listener();
}

/** Take a prompt off the queue and settle it. */
function removePrompt(prompt: PendingAuthPrompt, decision: RelayAuthDecision): void {
  const index = queue.indexOf(prompt);
  if (index === -1) return;
  queue.splice(index, 1);
  clearTimeout(prompt.timer);
  prompt.resolve(decision);
  notify();
}

/**
 * Forget this session's answers and decline every waiting prompt. Called when
 * the active account changes, so one account's answer never signs another in.
 */
export function resetRelayAuthSession(): void {
  sessionAnswers.clear();
  for (const prompt of [...queue]) removePrompt(prompt, { allowed: false, remember: false });
}

/**
 * Show a relay's prompt inline instead of in the floating card. Returns a
 * function that releases the claim.
 */
export function claimRelayAuthPrompt(url: string): () => void {
  const href = normalizeRelayUrl(url);
  if (!href) return () => {};
  claimed.set(href, (claimed.get(href) ?? 0) + 1);
  notify();
  return () => {
    const count = (claimed.get(href) ?? 1) - 1;
    if (count > 0) claimed.set(href, count);
    else claimed.delete(href);
    notify();
  };
}

/** Whether a page is showing this relay's prompt inline. */
export function isRelayAuthClaimed(url: string): boolean {
  const href = normalizeRelayUrl(url);
  return !!href && claimed.has(href);
}

/** Whether a relay is waiting for the user to answer its prompt. */
export function isRelayAuthPending(url: string): boolean {
  const href = normalizeRelayUrl(url);
  return !!href && queue.some((p) => p.url === href);
}

/**
 * Ask the user whether a relay may authenticate them. Concurrent requests for
 * the same relay share one prompt, and an answer that wasn't remembered still
 * applies for the rest of the session, so no relay is asked about twice.
 */
export function requestRelayAuth(rawUrl: string): Promise<RelayAuthDecision> {
  const url = normalizeRelayUrl(rawUrl) ?? rawUrl;
  const answered = sessionAnswers.get(url);
  if (answered !== undefined) return Promise.resolve({ allowed: answered, remember: false });

  return new Promise((resolve) => {
    const existing = queue.find((p) => p.url === url);
    if (existing) {
      const previous = existing.resolve;
      existing.resolve = (decision) => {
        previous(decision);
        resolve(decision);
      };
      return;
    }

    queue.push({ url, resolve });
    notify();
  });
}

/** The prompt to show: the first waiting relay, and how many are waiting. */
export function getPendingRelayAuth(): { url: string; total: number } | undefined {
  return snapshot;
}

/** Answer the prompt for a relay. */
export function answerRelayAuth(rawUrl: string, decision: RelayAuthDecision): void {
  // Callers may pass the URL as written (e.g. from a route) rather than the
  // normalized form the queue holds.
  const url = normalizeRelayUrl(rawUrl) ?? rawUrl;
  const prompt = queue.find((p) => p.url === url);
  if (!prompt) return;
  sessionAnswers.set(url, decision.allowed);
  removePrompt(prompt, decision);
}

/** Subscribe to prompt changes (for `useSyncExternalStore`). */
export function subscribeRelayAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Stand-in for a blocked relay
// ---------------------------------------------------------------------------

/**
 * Returned by the pool in place of a connection to a blocked relay. It never
 * opens a socket: subscriptions end straight away with EOSE, queries find
 * nothing, and publishing fails.
 */
export class BlockedRelay {
  constructor(readonly url: string) {}

  async *req(): AsyncIterable<['EOSE', string]> {
    yield ['EOSE', ''];
  }

  async query(): Promise<never[]> {
    return [];
  }

  async event(): Promise<void> {
    throw new Error(`Relay is blocked: ${this.url}`);
  }

  async count(): Promise<{ count: number }> {
    return { count: 0 };
  }

  async close(): Promise<void> {}

  async [Symbol.asyncDispose](): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Relay that reports when it needs AUTH
// ---------------------------------------------------------------------------

/** `Promise.withResolvers`, which older WebViews lack. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Most AUTH attempts one connection may start per {@link AUTH_WINDOW_MS}. */
const MAX_AUTH_ATTEMPTS = 3;
const AUTH_WINDOW_MS = 60_000;
/** How long to wait for the relay's OK to an AUTH before giving up on it. */
const AUTH_OK_TIMEOUT_MS = 30_000;

/**
 * `NRelay1` that can tell when the relay actually requires AUTH, and that
 * won't let a relay drive the signer.
 *
 * - Many relays send a challenge as soon as a socket opens, even when
 *   nothing needs it. {@link AuthAwareRelay.authNeeded} resolves only once
 *   the relay refuses a request with an `auth-required:` reply, so a prompt
 *   can wait until then. Nostrify retries that request after AUTH completes.
 * - Every `AUTH` message would otherwise start a new signing request (an
 *   extension popup, a bunker round-trip). Challenges that arrive while one
 *   is being answered, or that were already answered, are only recorded,
 *   and each connection gets a few attempts a minute.
 */
export class AuthAwareRelay extends NRelay1 {
  private needed = deferred();
  private refused = false;
  private readonly signAuth?: (challenge: string) => Promise<NostrEvent>;
  /** The relay's most recent challenge. */
  private challenge?: string;
  /** The challenge the relay accepted an AUTH for. */
  private acceptedChallenge?: string;
  /** The AUTH being answered, resolving to whether the relay accepted it. */
  private attempt?: { challenge: string; eventId?: string; done: ReturnType<typeof deferred<boolean>>; timer?: ReturnType<typeof setTimeout> };
  private attemptTimes: number[] = [];

  constructor(url: string, opts: NRelay1Opts = {}) {
    // `super` needs the callback before `this` exists; it's only called later.
    const owner: { relay?: AuthAwareRelay } = {};
    const { auth } = opts;
    super(url, { ...opts, auth: auth && ((challenge: string) => owner.relay!.answer(challenge)) });
    owner.relay = this;
    this.signAuth = auth;
  }

  /** Whether the relay has refused a request until the user signs in. */
  get requiresAuth(): boolean {
    return this.refused;
  }

  /** The relay's most recent AUTH challenge. Sign this one, not a stale one. */
  get currentChallenge(): string | undefined {
    return this.challenge;
  }

  /** Resolves when the relay rejects a request because it wants AUTH. */
  authNeeded(): Promise<void> {
    return this.needed.promise;
  }

  /**
   * Answer the relay's last challenge again, e.g. once the user opens the
   * relay's page after declining it elsewhere. Nostrify only answers a
   * challenge when it arrives. Resolves to whether the relay newly accepted
   * an AUTH, so a caller can reload what it refused.
   */
  retryAuth(): Promise<boolean> {
    if (!this.attempt && this.challenge && this.acceptedChallenge !== this.challenge) {
      this.receive(['AUTH', this.challenge]);
    }
    return this.pendingAttempt();
  }

  private pendingAttempt(): Promise<boolean> {
    return this.attempt?.done.promise ?? Promise.resolve(false);
  }

  /** Sign an AUTH through the configured callback, tracking the attempt. */
  private async answer(challenge: string): Promise<NostrEvent> {
    const attempt = this.attempt;
    try {
      const event = await this.signAuth!(challenge);
      if (attempt && attempt === this.attempt) {
        attempt.challenge = event.tags.find(([name]) => name === 'challenge')?.[1] ?? challenge;
        attempt.eventId = event.id;
        attempt.timer = setTimeout(() => this.settle(false), AUTH_OK_TIMEOUT_MS);
      }
      return event;
    } catch (error) {
      if (attempt === this.attempt) this.settle(false);
      throw error;
    }
  }

  private settle(accepted: boolean): void {
    const attempt = this.attempt;
    if (!attempt) return;
    this.attempt = undefined;
    clearTimeout(attempt.timer);
    if (accepted) this.acceptedChallenge = attempt.challenge;
    attempt.done.resolve(accepted);
  }

  protected override receive(msg: NostrRelayMsg): void {
    if (msg[0] === 'AUTH') {
      this.challenge = msg[1];
      if (!this.signAuth || this.attempt || this.acceptedChallenge === msg[1]) return;
      const now = Date.now();
      this.attemptTimes = this.attemptTimes.filter((t) => now - t < AUTH_WINDOW_MS);
      if (this.attemptTimes.length >= MAX_AUTH_ATTEMPTS) return;
      this.attemptTimes.push(now);
      this.attempt = { challenge: msg[1], done: deferred<boolean>() };
    }
    if (msg[0] === 'OK' && this.attempt?.eventId === msg[1]) {
      this.settle(msg[2]);
    }
    if (
      (msg[0] === 'CLOSED' && msg[2].startsWith('auth-required:'))
      || (msg[0] === 'OK' && !msg[2] && msg[3].startsWith('auth-required:'))
    ) {
      this.refused = true;
      this.needed.resolve();
    }
    super.receive(msg);
  }
}
