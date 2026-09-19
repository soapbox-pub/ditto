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
 * Read Kraken's ticker: `result.<pair>.c[0]` is the last-trade close.
 *
 * The pair is matched rather than taken positionally. Kraken names XMR/USD
 * `XXMRZUSD`, and a response carrying anything else is not an XMR price.
 */
function extractKrakenPrice(json: unknown): number | null {
  if (typeof json !== 'object' || json === null) return null;
  const { result } = json as KrakenTickerResponse;
  if (!result || typeof result !== 'object') return null;

  for (const [pair, entry] of Object.entries(result)) {
    if (!/XMR/i.test(pair) || !/USD/i.test(pair)) continue;
    const value = Number.parseFloat(entry?.c?.[0] ?? '');
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/**
 * Pull a numeric price out of an arbitrary JSON response.
 *
 * The flat shapes most other price APIs use, so pointing `moneroPriceApi` at a
 * CoinGecko simple-price URL or a self-hosted endpoint works without a code
 * change. Returns `null` when nothing parseable is found.
 *
 * Note how indiscriminate this is: the first positive number anywhere in the
 * body wins. That is the cost of accepting an arbitrary endpoint, and it is
 * why {@link fetchMoneroPrice} only uses it for a **custom** one — the default
 * goes through the Kraken reader above, which knows what it is looking at.
 */
function extractPrice(json: unknown): number | null {
  if (typeof json !== 'object' || json === null) return null;

  const kraken = extractKrakenPrice(json);
  if (kraken !== null) return kraken;

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
 * Prices outside this range are discarded as unusable.
 *
 * A price is a multiplier on an amount the user is about to send
 * irreversibly: "$5" at a price of 0.01 is 500 XMR. The bounds are wide enough
 * that only a broken feed — a rate for the wrong pair, a stray number picked
 * out of an unrelated JSON body, a value in the wrong unit — falls outside
 * them, and the wallet showing XMR only is a far better outcome than the
 * wallet confidently converting with a wrong number.
 */
const MIN_PLAUSIBLE_XMR_USD = 1;
const MAX_PLAUSIBLE_XMR_USD = 100_000;

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

    // The default endpoint has a known shape, so read it exactly. The
    // permissive scan is for endpoints a self-hoster pointed us at, where we
    // have no idea what we're parsing.
    const price =
      apiUrl === DEFAULT_MONERO_PRICE_API ? extractKrakenPrice(json) : extractPrice(json);

    if (price === null) return undefined;
    if (price < MIN_PLAUSIBLE_XMR_USD || price > MAX_PLAUSIBLE_XMR_USD) {
      console.warn(`Ignoring implausible XMR price: ${price}`);
      return undefined;
    }

    return price;
  } catch {
    return undefined;
  }
}
