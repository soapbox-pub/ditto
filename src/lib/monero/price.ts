/**
 * XMR spot price.
 *
 * Ditto's Bitcoin wallet gets its price from mempool.space's `/v1/prices`
 * extension, riding along on an API it already talks to. Monero has no
 * equivalent — a `monerod` knows nothing about fiat — so the price has to come
 * from somewhere else.
 *
 * The default is **Kraken's public ticker**: no API key, no account, and no
 * vendor-operated middleman that could correlate price polls with a wallet.
 * This is deliberately the approach Monerujo takes (it reads Kraken, the ECB
 * and Yadio directly) rather than Cake Wallet's, which routes every quote
 * through `prices.cakewallet.com` behind an API key. For a wallet whose whole
 * point is not leaking to third parties, the fewer operators involved the
 * better.
 *
 * The endpoint is configurable (`AppConfig.moneroPriceApi`) so a self-hoster
 * can point it at their own proxy — or at nothing, if they'd rather the app
 * never make the request. A failed price fetch is not an error condition: the
 * wallet falls back to showing XMR only.
 */

/** Kraken's public XMR/USD ticker. No authentication required. */
export const DEFAULT_MONERO_PRICE_API = 'https://api.kraken.com/0/public/Ticker?pair=XMRUSD';

/** Kraken's ticker response, narrowed to the field we read. */
interface KrakenTickerResponse {
  error?: string[];
  result?: Record<string, { c?: [string, string] }>;
}

/** A generic `{ "usd": 123.45 }`-shaped response, as CoinGecko-style APIs return. */
interface SimplePriceResponse {
  [key: string]: unknown;
}

/**
 * Pull a numeric price out of an arbitrary JSON response.
 *
 * Handles Kraken's shape (`result.<pair>.c[0]` — last-trade close) plus the
 * flatter shapes most other price APIs use, so pointing `moneroPriceApi` at a
 * CoinGecko simple-price URL or a self-hosted endpoint works without a code
 * change. Returns `null` when nothing parseable is found.
 */
function extractPrice(json: unknown): number | null {
  if (typeof json !== 'object' || json === null) return null;

  // Kraken: { result: { XXMRZUSD: { c: ["123.45", "1.0"] } } }
  const kraken = json as KrakenTickerResponse;
  if (kraken.result && typeof kraken.result === 'object') {
    for (const entry of Object.values(kraken.result)) {
      const close = entry?.c?.[0];
      if (typeof close === 'string') {
        const value = Number.parseFloat(close);
        if (Number.isFinite(value) && value > 0) return value;
      }
    }
  }

  // CoinGecko simple price: { monero: { usd: 123.45 } }
  const simple = json as SimplePriceResponse;
  for (const value of Object.values(simple)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'object' && value !== null) {
      const usd = (value as { usd?: unknown }).usd;
      if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) return usd;
    }
  }

  return null;
}

/**
 * Fetch the current XMR price in USD.
 *
 * Returns `undefined` rather than throwing when the price is unavailable —
 * callers render the XMR amount alone in that case, which is a degraded
 * display, not a broken wallet.
 */
export async function fetchMoneroPrice(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<number | undefined> {
  if (!apiUrl) return undefined;

  try {
    const response = await fetch(apiUrl, {
      signal: signal ?? AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return undefined;

    const json: unknown = await response.json();
    return extractPrice(json) ?? undefined;
  } catch {
    return undefined;
  }
}
