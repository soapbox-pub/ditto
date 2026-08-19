/**
 * LNURL-pay (LUD-06 / LUD-16) resolution for zaps.
 *
 * `nostr-tools`' `nip57.getZapEndpoint` returns only the `callback` URL and
 * throws away everything else the endpoint said — including the `minSendable`
 * / `maxSendable` bounds and the `metadata` string that LUD-06 uses to bind an
 * invoice to the endpoint that issued it. Both are needed to check that the
 * invoice we get back is the one we asked for, so resolution lives here
 * instead.
 *
 * Everything in an LNURL-pay response is chosen by the payment *recipient*, so
 * none of it is trusted: it is validated for shape, the transport is pinned to
 * HTTPS, and the caller re-checks the resulting invoice against the amount the
 * user actually approved (see `assertInvoiceAmount` in `@/lib/bolt11`).
 */
import { bech32 } from '@scure/base';

/** A validated LNURL-pay response. */
export interface LnurlPayParams {
  /** URL to request the invoice from. Always `https:`. */
  callback: string;
  /** Smallest payable amount, in millisatoshis. */
  minSendable: number;
  /** Largest payable amount, in millisatoshis. */
  maxSendable: number;
  /** LUD-06 metadata string. The invoice's description hash may commit to it. */
  metadata: string;
  /** Whether the endpoint accepts a NIP-57 zap request. */
  allowsNostr: boolean;
  /** Pubkey the endpoint signs zap receipts with, when it supports zaps. */
  nostrPubkey?: string;
}

/** Shape of the JSON an LNURL-pay endpoint returns. */
interface LnurlPayResponse {
  tag?: unknown;
  callback?: unknown;
  minSendable?: unknown;
  maxSendable?: unknown;
  metadata?: unknown;
  allowsNostr?: unknown;
  nostrPubkey?: unknown;
  reason?: unknown;
}

/** A lightning address (`name@domain`) or a bech32 `lnurl1…` string. */
export interface LnurlSource {
  lud06?: string;
  lud16?: string;
}

/**
 * Turn a `lud06` / `lud16` pointer into the URL to fetch LNURL-pay params
 * from. Returns `null` when neither is usable.
 *
 * HTTPS is required. A `lud06` may encode any URL at all, and plaintext HTTP
 * would let anyone on the network path swap the invoice for one of their own —
 * which is the entire attack this module exists to prevent.
 */
export function lnurlToUrl({ lud06, lud16 }: LnurlSource): string | null {
  let raw: string;

  if (lud06?.trim()) {
    const { words } = bech32.decode(lud06.trim().toLowerCase() as `${Lowercase<string>}1${string}`, false);
    raw = new TextDecoder().decode(bech32.fromWords(words));
  } else if (lud16?.trim()) {
    const [name, domain] = lud16.trim().split('@');
    if (!name || !domain) return null;
    raw = new URL(`/.well-known/lnurlp/${encodeURIComponent(name)}`, `https://${domain}`).toString();
  } else {
    return null;
  }

  const url = new URL(raw);
  if (url.protocol !== 'https:') {
    throw new Error('Lightning address must use HTTPS');
  }
  return url.toString();
}

/** Coerce a JSON value to a non-negative integer, or `null` if it isn't one. */
function toCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/**
 * Fetch and validate the LNURL-pay parameters for a payment pointer.
 *
 * Throws with a user-presentable message when the endpoint is unreachable or
 * its response doesn't conform.
 */
export async function resolveLnurlPay(source: LnurlSource, signal?: AbortSignal): Promise<LnurlPayParams> {
  const url = lnurlToUrl(source);
  if (!url) {
    throw new Error('No lightning address configured');
  }

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Lightning service returned HTTP ${res.status}`);
  }

  const body: LnurlPayResponse = await res.json();

  if (typeof body.reason === 'string' && !body.callback) {
    throw new Error(body.reason);
  }
  if (body.tag !== 'payRequest') {
    throw new Error('Lightning address does not support payments');
  }
  if (typeof body.callback !== 'string') {
    throw new Error('Lightning service returned no payment callback');
  }

  // The callback is a second, separate URL the endpoint gets to choose. Pin it
  // to HTTPS for the same reason as the LNURL itself.
  const callback = new URL(body.callback);
  if (callback.protocol !== 'https:') {
    throw new Error('Lightning service requested an insecure payment callback');
  }

  const minSendable = toCount(body.minSendable);
  const maxSendable = toCount(body.maxSendable);
  if (minSendable === null || maxSendable === null || minSendable > maxSendable) {
    throw new Error('Lightning service returned invalid payment limits');
  }

  return {
    callback: callback.toString(),
    minSendable,
    maxSendable,
    metadata: typeof body.metadata === 'string' ? body.metadata : '',
    allowsNostr: body.allowsNostr === true,
    nostrPubkey: typeof body.nostrPubkey === 'string' ? body.nostrPubkey : undefined,
  };
}
