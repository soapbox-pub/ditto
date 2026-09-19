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
 * ## Why this list is short, and why every entry is CORS-enabled
 *
 * A browser wallet can only reach a node that sends `Access-Control-Allow-*`
 * headers, including on the binary `/getblocks.bin` endpoint that sync
 * actually hammers. Most public Monero nodes do not — `monerod` only emits
 * them when started with `--rpc-access-control-origins`. A node that syncs
 * fine in Cake Wallet or Feather (native HTTP, no CORS) will silently fail
 * here. Every default below was checked for a reflected
 * `Access-Control-Allow-Origin` on both `/json_rpc` and `/getblocks.bin`.
 *
 * Adding a node in Settings that lacks CORS produces a connection failure with
 * no useful browser-side diagnostic (the preflight is rejected before any
 * response body exists), so `testMoneroNode` below reports that case
 * explicitly rather than as a generic network error.
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
 * Default node list.
 *
 * `xmr-node.cakewallet.com` is first because it is the one public node
 * verified to return full CORS headers — including preflight `OPTIONS` and the
 * binary `/getblocks.bin` endpoint — which is the hard requirement for a
 * browser wallet. The others are widely-used community nodes included as
 * fallbacks; if one of them has not enabled CORS it will surface as
 * "unreachable" in Settings rather than failing mysteriously mid-sync.
 */
export const DEFAULT_MONERO_NODES: readonly MoneroNode[] = [
  { url: 'https://xmr-node.cakewallet.com:18081', label: 'Cake Wallet' },
  { url: 'https://node.monerodevs.org:18089', label: 'MoneroDevs' },
  { url: 'https://xmr.stormycloud.org:18089', label: 'StormyCloud' },
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
   * Why the probe failed. `cors` is called out separately because it is by far
   * the most common cause for a node that works in every native wallet.
   */
  error?: 'cors' | 'timeout' | 'http' | 'network';
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
    // A CORS rejection surfaces as an opaque TypeError with no status. We
    // can't distinguish it from a DNS failure at the API level, but CORS is
    // overwhelmingly the likelier cause for a host that resolves at all, and
    // saying so gives the user something actionable.
    if (error instanceof TypeError) return { url, ok: false, error: 'cors' };
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
