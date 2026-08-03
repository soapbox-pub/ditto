/**
 * Lightweight Bitcoin money helpers — sats/BTC/USD conversions, display
 * formatting, and BTC price fetching.
 *
 * Deliberately free of `@scure/btc-signer` (and the rest of the heavy
 * signing stack in `@/lib/bitcoin`) so components on the initial-load path
 * (feed cards, zap amounts, notification rows) can format money without
 * pulling ~150 kB of transaction-signing code into the entry bundle.
 * `@/lib/bitcoin` re-exports everything here, so lazy-loaded wallet code
 * can keep importing from one place.
 */
import { esploraFetch } from './esplora';

/** Convert satoshis to a BTC string with up to 8 decimal places. */
export function satsToBTC(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

/**
 * Convert satoshis to a BTC string with trailing zeros stripped.
 * E.g. `formatBTC(100_000_000)` → `"1"`, `formatBTC(1_234_560)` → `"0.0123456"`.
 */
export function formatBTC(sats: number): string {
  return satsToBTC(sats).replace(/\.?0+$/, '');
}

/** Format a satoshi amount with locale-aware thousand separators. */
export function formatSats(sats: number): string {
  return sats.toLocaleString();
}

/**
 * Fetch the current BTC price in USD from a mempool.space-compatible API.
 *
 * Note: the `/v1/prices` endpoint is a mempool.space extension to the
 * standard Esplora REST surface. Backends like Blockstream's Esplora do
 * not expose it — those endpoints return `404` and the failover client
 * silently advances to the next URL (without penalising the endpoint).
 *
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchBtcPrice(baseUrls: string[], signal?: AbortSignal): Promise<number> {
  const response = await esploraFetch(baseUrls, `/v1/prices`, {
    // /v1/prices is a mempool.space extension — 404 means "endpoint doesn't
    // speak this path", not "the endpoint is dead". Soft-failover to the
    // next URL without putting this one in cool-down.
    skipStatuses: [404],
    signal,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch BTC price');
  }

  const data = await response.json();
  return data.USD;
}

/** Convert a BTC amount to satoshis (rounded to nearest integer). */
export function btcToSats(btc: number): number {
  return Math.round(btc * 100_000_000);
}

/**
 * USD threshold above which Bitcoin send/zap flows require explicit
 * confirmation (two-tap). Chosen to catch meaningful dollar amounts without
 * nagging on everyday $5–$25 zaps.
 */
export const LARGE_AMOUNT_USD_THRESHOLD = 100;

/**
 * Whether a given satoshi amount crosses the "large amount" threshold at the
 * current BTC/USD price. Returns false when `btcPrice` is unavailable, so the
 * UI does not arm confirmation without a known USD value.
 */
export function isLargeAmount(sats: number, btcPrice: number | undefined): boolean {
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return false;
  if (!Number.isFinite(sats) || sats <= 0) return false;
  const usd = (sats / 100_000_000) * btcPrice;
  return usd >= LARGE_AMOUNT_USD_THRESHOLD;
}

/** Convert satoshis to USD given a BTC price. */
export function satsToUSD(sats: number, btcPrice: number): string {
  const btc = sats / 100_000_000;
  return (btc * btcPrice).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
