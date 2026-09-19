/**
 * Monero remote-node configuration.
 *
 * Unlike Bitcoin — where Ditto talks to an Esplora REST API that only ever
 * sees an address — a Monero wallet scans the chain itself, pulling every
 * block from a `monerod` over its RPC. The node therefore learns your IP and
 * the timing of your requests (never your keys, balance, or which outputs are
 * yours). That makes *which* node you use a real privacy choice, which is why
 * the list is user-configurable in Settings rather than hardcoded.
 *
 * ## Why this list is so short
 *
 * A browser imposes two requirements that native wallets don't, and public
 * Monero nodes routinely fail both:
 *
 *  1. **A publicly-trusted TLS certificate.** Most public nodes serve RPC over
 *     TLS with a *self-signed* certificate on a non-standard port. Cake,
 *     Feather and Monerujo accept those; a browser rejects them outright with
 *     `ERR_CERT_AUTHORITY_INVALID` and offers no override for a subresource
 *     request. This is the bigger filter in practice.
 *  2. **CORS headers**, including on the binary `/getblocks.bin` endpoint that
 *     sync actually hammers. `monerod` only emits them when started with
 *     `--rpc-access-control-origins`.
 *
 * The defaults below were measured from a real browser, not assumed. Of ten
 * widely-recommended public nodes tested, exactly two worked; the rest failed
 * on certificates (`node.monerodevs.org`, `node2.monerodevs.org`,
 * `xmr.stormycloud.org`, `nodes.hashvault.pro` — all
 * `ERR_CERT_AUTHORITY_INVALID`; `monero.stackwallet.com` —
 * `ERR_CERT_DATE_INVALID`) or DNS. Note that the one entry on a standard port,
 * `node.sethforprivacy.com:443`, works precisely because port 443 implies a
 * normal certificate.
 *
 * **Do not add a node here without testing it in a browser.** A node that
 * works everywhere else will still fail here, and the failure is opaque:
 * `fetch` rejects with a bare `TypeError` that cannot distinguish a bad
 * certificate from a missing CORS header. `testMoneroNode` below says as much
 * rather than guessing at one cause.
 *
 * ## Ordering
 *
 * First entry is the default. There is no automatic failover mid-sync the way
 * `esploraFetch` rotates REST hosts: wallet2 holds a single daemon connection
 * for the life of a sync, so switching nodes means reconnecting the wallet.
 * `pickReachableNode` is used at connect time only.
 */

/** A configured Monero remote node. */
export interface MoneroNode {
  /** Full origin, e.g. `https://xmr-node.cakewallet.com:18081`. */
  url: string;
  /** Human-readable label for the settings UI. */
  label: string;
}

/**
 * Default node list — every entry verified from a real browser.
 *
 * Kept deliberately to nodes that answered `get_info` over `fetch` with a
 * valid certificate and working CORS. A longer list of plausible-looking
 * entries would be worse than useless: each unreachable node is a timeout the
 * user waits through before the wallet connects.
 */
export const DEFAULT_MONERO_NODES: readonly MoneroNode[] = [
  { url: 'https://xmr-node.cakewallet.com:18081', label: 'Cake Wallet' },
  { url: 'https://node.sethforprivacy.com:443', label: 'Seth For Privacy' },
];

/** Default node URLs, for `AppConfig.moneroNodes`. */
export const DEFAULT_MONERO_NODE_URLS: readonly string[] = DEFAULT_MONERO_NODES.map((n) => n.url);

/** Look up the friendly label for a node URL, falling back to its hostname. */
export function nodeLabel(url: string): string {
  const known = DEFAULT_MONERO_NODES.find((n) => n.url === url);
  if (known) return known.label;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Normalize a user-entered node URL.
 *
 * Accepts `host:port`, `//host:port`, or a full URL, and defaults to `https:`.
 * Returns `null` when the result isn't a usable http(s) origin.
 *
 * Plain `http:` is allowed — a self-hosted node on a LAN or over a local Tor
 * proxy is a legitimate and privacy-superior setup — but note that a browser
 * on an `https:` page will block it as mixed content. The settings UI warns
 * about this rather than silently rejecting it, since it works fine in the
 * Capacitor native builds where the page origin isn't `https:`.
 */
export function normalizeNodeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    // Preserve an explicit port; drop any path/query, which monerod ignores.
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** Whether a normalized node URL will be blocked as mixed content. */
export function isMixedContent(url: string): boolean {
  if (typeof globalThis.location === 'undefined') return false;
  return globalThis.location.protocol === 'https:' && url.startsWith('http://');
}

/** Result of a node reachability probe. */
export interface NodeProbeResult {
  url: string;
  ok: boolean;
  /** Round-trip time in milliseconds, when reachable. */
  responseMs?: number;
  /** Node's reported chain height, when reachable. */
  height?: number;
  /**
   * Why the probe failed. `blocked` means the browser refused the request
   * before any response existed — a self-signed certificate or a missing CORS
   * header, which `fetch` reports identically as a bare `TypeError`. It is by
   * far the most common outcome for a node that works in every native wallet.
   */
  error?: 'blocked' | 'timeout' | 'http' | 'network';
}

/**
 * Probe a node's `get_info` over JSON-RPC.
 *
 * Mirrors what Monerujo's `NodeInfo.testRpcService()` does — measure the
 * round-trip and read the height — because response time is the only signal a
 * user has for picking between otherwise-identical nodes.
 */
export async function testMoneroNode(
  url: string,
  { timeoutMs = 10_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<NodeProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  const started = performance.now();
  try {
    const response = await fetch(`${url}/json_rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '0', method: 'get_info' }),
      signal: controller.signal,
    });

    if (!response.ok) return { url, ok: false, error: 'http' };

    const json = (await response.json()) as { result?: { height?: number } };
    return {
      url,
      ok: true,
      responseMs: Math.round(performance.now() - started),
      height: json.result?.height,
    };
  } catch (error) {
    if (controller.signal.aborted) return { url, ok: false, error: 'timeout' };
    // A certificate rejection, a CORS rejection and a DNS failure all surface
    // as an opaque TypeError with no status — the browser deliberately denies
    // the page any detail. Measured against ten public nodes, a bad
    // certificate was the most common cause, CORS second, so the UI names both
    // rather than asserting one.
    if (error instanceof TypeError) return { url, ok: false, error: 'blocked' };
    return { url, ok: false, error: 'network' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Return the first reachable node from `urls`, probing in order.
 *
 * Used once at wallet-connect time. Falls back to the first configured URL
 * when nothing answers, so the caller still gets a connection attempt (and a
 * real error from wallet2) rather than a silent no-op.
 */
export async function pickReachableNode(
  urls: readonly string[],
  { signal }: { signal?: AbortSignal } = {},
): Promise<string> {
  for (const url of urls) {
    const result = await testMoneroNode(url, { timeoutMs: 6_000, signal });
    if (result.ok) return url;
    if (signal?.aborted) break;
  }
  return urls[0] ?? DEFAULT_MONERO_NODE_URLS[0];
}
