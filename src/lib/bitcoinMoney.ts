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
import type { CurrencyDisplay } from '@/contexts/AppContext';

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

/** Convert a USD amount to satoshis at the given BTC price. */
export function usdToSats(usd: number, btcPrice: number): number {
  return Math.round((usd / btcPrice) * 100_000_000);
}

/**
 * Format an exact satoshi amount with its unit — `"5,000 sats"`, `"1 sat"`.
 *
 * Unlike the `formatNumber`-based rendering in `useFormatMoney`, this never
 * abbreviates. Payment surfaces show the precise amount being spent, so
 * `"21k sats"` would be the wrong level of detail on a send button.
 */
export function formatSatsAmount(sats: number): string {
  return `${formatSats(sats)} ${sats === 1 ? 'sat' : 'sats'}`;
}

/**
 * Format a satoshi amount in the user's preferred display currency, exactly
 * (no abbreviation). Falls back to sats when USD is preferred but no BTC
 * price is available, so a dead price endpoint never blanks out an amount.
 */
export function formatMoneyAmount(
  sats: number,
  currency: CurrencyDisplay,
  btcPrice: number | undefined,
): string {
  if (currency === 'usd' && btcPrice && Number.isFinite(btcPrice) && btcPrice > 0) {
    return satsToUSD(sats, btcPrice);
  }
  return formatSatsAmount(sats);
}

/**
 * Convert a raw amount-input value — a string while the user is typing, a
 * number once committed — into satoshis. The value is denominated in the
 * user's display currency, so USD needs a BTC price while sats is the
 * identity (rounded, since fractional sats aren't payable).
 *
 * Returns 0 for blank, negative, non-numeric, and (in USD mode) unpriced
 * input, which every caller already treats as "no amount entered".
 */
export function amountInputToSats(
  value: number | string,
  currency: CurrencyDisplay,
  btcPrice: number | undefined,
): number {
  const amount = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (currency === 'sats') return Math.round(amount);
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return 0;
  return usdToSats(amount, btcPrice);
}

/**
 * Format a raw amount-input value in its own units, without needing a BTC
 * price. Used for the brief window in USD mode where the price hasn't loaded
 * and `amountInputToSats` still returns 0 — the send button can echo what the
 * user typed instead of going blank. Returns `""` for a blank or invalid value.
 */
export function formatAmountInput(value: number | string, currency: CurrencyDisplay): string {
  const amount = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(amount) || amount <= 0) return '';
  if (currency === 'sats') return formatSatsAmount(Math.round(amount));
  return amount < 1 ? `$${amount.toFixed(2)}` : `$${amount}`;
}

/**
 * A pair of preset amount chips — one set per display currency. Sats presets
 * are hand-picked round numbers rather than conversions of the USD ones, so
 * sats users get `1,000` instead of `947`.
 */
export interface AmountPresetSet {
  usd: number[];
  sats: number[];
}

/** The preset list for the active display currency. */
export function presetsFor(presets: AmountPresetSet, currency: CurrencyDisplay): number[] {
  return currency === 'sats' ? presets.sats : presets.usd;
}
