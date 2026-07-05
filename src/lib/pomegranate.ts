/**
 * Pomegranate protocol client — "Log in with Google" for Nostr.
 *
 * Pomegranate (https://viewsource.win/fiatjaf.com/promenade + pomade) lets a
 * user authenticate with Google against a `central` server, FROST-shard their
 * secret key across multiple `operator` servers, and then sign events through
 * a standard NIP-46 bunker whose relay is the central server itself. No
 * single server ever holds the full key.
 *
 * This module implements the client side of the protocol:
 *
 * 1. Google OAuth popup against `<central>/login/google` → base64 token
 *    (a kind 20443 event signed by central, carrying an `email` tag).
 * 2. `GET /account` to check for an existing account.
 * 3. For new users: FROST-shard a fresh secret key, register the public
 *    shards with central (kind 20445) and each secret shard with its
 *    operator (kind 20444), then publish a kind 16440 setup announcement so
 *    other clients can discover which central server the user set up with.
 * 4. `GET/POST /profiles` to obtain a NIP-46 handler pubkey, from which a
 *    normal `bunker://` URI is built.
 *
 * All kinds here (20443/20444/20445/16440) are defined by the Pomegranate
 * protocol, not by Ditto.
 */

import { argon2id } from '@noble/hashes/argon2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { hexPubShard, hexShard, trustedKeyDeal } from '@fiatjaf/promenade-trusted-dealer';
import { finalizeEvent } from 'nostr-tools';

import type { NostrEvent, NPool } from '@nostrify/nostrify';

const utf8 = new TextEncoder();

/** Kind of the base64-encoded auth token event minted by `central`. */
const KIND_CENTRAL_TOKEN = 20443;
/** Kind of the operator registration event (carries the secret shard). */
const KIND_OPERATOR_REGISTRATION = 20444;
/** Kind of the central registration event (carries the public shards). */
const KIND_CENTRAL_REGISTRATION = 20445;
/** Kind of the public setup announcement (replaceable). */
const KIND_SETUP_ANNOUNCEMENT = 16440;

/**
 * Relays where kind 16440 setup announcements are published and looked up.
 * These are fixed by the protocol's reference client so that any client can
 * find any user's announcement.
 */
export const SETUP_ANNOUNCEMENT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://nostr.mom',
  'wss://offchain.pub',
];

/** Response shape of `GET <central>/account`. */
export interface PomegranateAccount {
  operators: { url: string; pubshard: string }[];
  threshold: number;
  pubkey: string;
  email: string;
}

/** One entry of the `GET <central>/profiles` response. */
export interface PomegranateProfile {
  handler_pubkey: string;
  name: string;
  email?: string;
  filter?: Record<string, unknown>;
}

/**
 * Normalizes a central/operator URL to its bare origin, defaulting to
 * `https:` (or `http:` for localhost). Throws on unparseable input, and on
 * any scheme other than http(s) — these URLs get used with `fetch()` and
 * `window.open()`, so nothing else may pass through.
 */
export function massagePomegranateUrl(url: string): string {
  let input = url.trim();
  if (!/^https?:\/\//i.test(input)) {
    const isLocalhost = /^(localhost|127\.0\.0\.1)([:/]|$)/i.test(input);
    input = `${isLocalhost ? 'http' : 'https'}://${input}`;
  }
  const parsed = new URL(input);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Invalid Pomegranate server URL: ${url}`);
  }
  return parsed.origin;
}

/**
 * Opens the Google OAuth popup against `central` and resolves with the auth
 * token it posts back. MUST be called synchronously from a user gesture
 * (click handler) or the popup will be blocked.
 *
 * Note: Google's OAuth page sets `Cross-Origin-Opener-Policy`, which severs
 * our handle to the popup — `popup.closed` and `popup.close()` become no-ops
 * and log COOP warnings. We therefore never poll the popup; the token always
 * arrives via `postMessage` from central's own callback page, and we fall
 * back to a timeout so a genuinely abandoned popup doesn't hang forever.
 */
export function authenticateWithGoogle(centralUrl: string, signal?: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const popup = window.open(`${centralUrl}/login/google`, 'OAuth', 'width=600,height=600');
    if (!popup) {
      reject(new Error('Popup blocked. Allow popups for this site and try again.'));
      return;
    }

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(timeout);
    };

    // Best-effort popup close; a no-op (and COOP-guarded) once Google's COOP
    // header has severed the handle, so ignore any failure.
    const tryClosePopup = () => {
      try {
        popup.close();
      } catch {
        // COOP — popup can't be closed programmatically. Harmless.
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== centralUrl || typeof event.data?.token !== 'string') return;
      cleanup();
      tryClosePopup();
      resolve(event.data.token);
    };

    const onAbort = () => {
      cleanup();
      tryClosePopup();
      reject(new DOMException('Login canceled', 'AbortError'));
    };

    // Give the user a few minutes to complete Google's flow, then give up so
    // the promise can't stay pending forever.
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Google sign-in timed out. Please try again.'));
    }, 5 * 60 * 1000);

    window.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * Extracts the email address from a central auth token (a base64-encoded
 * kind 20443 event with an `email` tag). Returns `undefined` when the token
 * is malformed.
 */
export function getTokenEmail(token: string): string | undefined {
  try {
    const event = JSON.parse(atob(token)) as NostrEvent;
    if (event.kind !== KIND_CENTRAL_TOKEN || !Array.isArray(event.tags)) return undefined;
    const email = event.tags.find((tag) => tag[0] === 'email')?.[1];
    return typeof email === 'string' && email.length > 0 ? email : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hashes an email for the kind 16440 announcement's `m` tag:
 * `argon2id(email, "pomegranate", {t: 1, m: 65536, p: 4})`, hex-encoded.
 * Parameters are fixed by the protocol. CPU-heavy (~64 MiB) — call sparingly.
 */
export function hashEmail(email: string): string {
  return bytesToHex(argon2id(utf8.encode(email), 'pomegranate', { t: 1, m: 65536, p: 4 }));
}

/** Standard headers for authenticated central API calls. */
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Token ${token}` };
}

/**
 * Fetches the user's account from central. Returns `null` when no account
 * is registered for the token's email (404).
 */
export async function fetchAccount(
  centralUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<PomegranateAccount | null> {
  const response = await fetch(`${centralUrl}/account`, { headers: authHeaders(token), signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Account lookup failed (${response.status})`);
  return response.json() as Promise<PomegranateAccount>;
}

/** Fetches the account's NIP-46 signing profiles from central. */
export async function fetchProfiles(
  centralUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<PomegranateProfile[]> {
  const response = await fetch(`${centralUrl}/profiles`, { headers: authHeaders(token), signal });
  if (!response.ok) throw new Error(`Profile lookup failed (${response.status})`);
  const profiles = await response.json() as PomegranateProfile[] | null;
  return Array.isArray(profiles) ? profiles : [];
}

/** Creates a new NIP-46 signing profile on central. */
export async function createProfile(
  centralUrl: string,
  token: string,
  name: string,
  signal?: AbortSignal,
): Promise<PomegranateProfile> {
  const response = await fetch(`${centralUrl}/profiles`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    signal,
  });
  if (!response.ok) throw new Error(`Profile creation failed (${response.status})`);
  return response.json() as Promise<PomegranateProfile>;
}

/**
 * Returns the handler pubkey of the account's `default` profile, creating
 * the profile if it doesn't exist yet.
 */
export async function ensureDefaultProfile(
  centralUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<string> {
  const profiles = await fetchProfiles(centralUrl, token, signal);
  const existing = profiles.find((profile) => profile.name === 'default');
  if (existing) return existing.handler_pubkey;
  const created = await createProfile(centralUrl, token, 'default', signal);
  return created.handler_pubkey;
}

/** Builds the NIP-46 bunker URI for a profile handler on a central server. */
export function buildBunkerUri(handlerPubkey: string, centralUrl: string): string {
  const relayUrl = centralUrl.replace(/^http/, 'ws');
  return `bunker://${handlerPubkey}?relay=${encodeURIComponent(relayUrl)}`;
}

export interface RegisterAccountParams {
  centralUrl: string;
  token: string;
  email: string;
  /** Massaged operator origins (≥ 2). */
  operators: string[];
  /** Signing threshold, 2 ≤ threshold ≤ operators.length. */
  threshold: number;
  /** The user's master secret key. Never sent anywhere whole. */
  secretKey: Uint8Array;
  signal?: AbortSignal;
  /** Called as each registration step completes (central + one per operator). */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Creates a new Pomegranate account: FROST-shards `secretKey` into one shard
 * per operator, registers the public shards with central (kind 20445), then
 * delivers each secret shard to its operator (kind 20444). The operators
 * confirm with central in the background; poll `fetchAccount` afterwards to
 * observe the account becoming operational.
 */
export async function registerAccount(params: RegisterAccountParams): Promise<void> {
  const { centralUrl, token, email, operators, threshold, secretKey, signal, onProgress } = params;

  if (operators.length < 2) throw new Error('At least 2 operators are required.');
  if (threshold < 2 || threshold > operators.length) throw new Error('Invalid signing threshold.');

  const total = operators.length + 1;
  const session = crypto.randomUUID();

  // FROST-shard the key: one shard per operator.
  const secretBigint = Array.from(secretKey).reduce(
    (acc, byte) => (acc << 8n) + BigInt(byte),
    0n,
  );
  const { shards } = trustedKeyDeal(secretBigint, threshold, operators.length);

  // Register the public shards with central.
  const registration = finalizeEvent({
    kind: KIND_CENTRAL_REGISTRATION,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['threshold', String(threshold)],
      ...operators.map((operator, i) => ['operator', operator, hexPubShard(shards[i].pubShard)]),
    ],
    content: '',
  }, secretKey);

  const centralResponse = await fetch(`${centralUrl}/register`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
      'X-Pomegranate-Session': session,
    },
    body: JSON.stringify(registration),
    signal,
  });
  if (!centralResponse.ok) {
    throw new Error(`Registration with ${new URL(centralUrl).host} failed (${centralResponse.status})`);
  }
  onProgress?.(1, total);

  // Deliver each secret shard to its operator. The operator token binds the
  // ack to our central registration session.
  for (let i = 0; i < operators.length; i++) {
    const operator = operators[i];
    const shardEvent = finalizeEvent({
      kind: KIND_OPERATOR_REGISTRATION,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['central', centralUrl],
        ['email', email],
      ],
      content: hexShard(shards[i]),
    }, secretKey);

    const operatorResponse = await fetch(`${operator}/po/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pomegranate-Operator-Token': bytesToHex(sha256(utf8.encode(`${session}:${operator}`))),
      },
      body: JSON.stringify(shardEvent),
      signal,
    });
    if (!operatorResponse.ok) {
      throw new Error(`Registration with operator ${new URL(operator).host} failed (${operatorResponse.status})`);
    }
    onProgress?.(2 + i, total);
  }
}

/**
 * Polls `GET /account` until the operators have confirmed and central marks
 * the account operational. Throws after `timeoutMs`.
 */
export async function waitForAccount(
  centralUrl: string,
  token: string,
  signal?: AbortSignal,
  timeoutMs = 30_000,
): Promise<PomegranateAccount> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    const account = await fetchAccount(centralUrl, token, signal);
    if (account) return account;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Timed out waiting for the account to become operational.');
}

/**
 * Publishes the kind 16440 setup announcement so other clients can discover
 * which central server this email's account lives on. Signed with the master
 * key (call before erasing it). Failures are non-fatal to login.
 */
export async function publishSetupAnnouncement(
  nostr: NPool,
  account: PomegranateAccount,
  centralUrl: string,
  secretKey: Uint8Array,
): Promise<void> {
  const event = finalizeEvent({
    kind: KIND_SETUP_ANNOUNCEMENT,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['m', hashEmail(account.email)],
      ['central', centralUrl],
      ...account.operators.map((operator) => ['operator', massagePomegranateUrl(operator.url)]),
      ['threshold', String(account.threshold)],
    ],
    content: '',
  }, secretKey);

  try {
    await nostr.group(SETUP_ANNOUNCEMENT_RELAYS).event(event, { signal: AbortSignal.timeout(8000) });
  } catch (error) {
    console.warn('Failed to publish Pomegranate setup announcement:', error);
  }
}

/**
 * Searches the announcement relays for an existing Pomegranate setup for
 * this email. Returns the central server URL from the announcement, or
 * `null` when none is found (or the announcement is malformed).
 *
 * NOTE: announcements are self-signed by whoever computed the email hash —
 * they are a *discovery hint*, not a proof. Callers must show the URL to the
 * user and require explicit confirmation before authenticating against it.
 */
export async function searchSetupAnnouncement(
  nostr: NPool,
  email: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const events = await nostr.group(SETUP_ANNOUNCEMENT_RELAYS).query(
      [{ kinds: [KIND_SETUP_ANNOUNCEMENT], '#m': [hashEmail(email)] }],
      { signal: signal ?? AbortSignal.timeout(5000) },
    );
    const [latest] = events.sort((a, b) => b.created_at - a.created_at);
    const central = latest?.tags.find((tag) => tag[0] === 'central')?.[1];
    return central ? massagePomegranateUrl(central) : null;
  } catch {
    return null;
  }
}
