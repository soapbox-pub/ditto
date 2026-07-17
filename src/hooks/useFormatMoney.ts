import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { fetchBtcPrice, satsToUSD } from '@/lib/bitcoinMoney';
import { formatNumber } from '@/lib/formatNumber';
import type { CurrencyDisplay } from '@/contexts/AppContext';

interface FormatMoneyOptions {
  /**
   * Layout for the formatted string.
   * - "long" (default): `"6,300 sats"` / `"$2.50"`. Used in card headers and detail rows.
   * - "compact": `"6.3k"` / `"$2.50"`. Used in tight action bars where the unit/icon
   *   is supplied alongside; the function omits the trailing "sats" so the bolt
   *   icon next to it carries the unit. USD always includes the `$`.
   */
  layout?: 'long' | 'compact';
}

export interface FormatMoneyResult {
  /** Format a satoshi amount according to the user's currency preference. */
  format: (sats: number, options?: FormatMoneyOptions) => string;
  /** The active currency preference. Useful for choosing surrounding copy. */
  currency: CurrencyDisplay;
  /** The fetched BTC/USD price, if available. Undefined while loading or on failure. */
  btcPrice: number | undefined;
}

/**
 * Format a satoshi amount as a string according to the user's currency preference.
 *
 * When `currencyDisplay === 'usd'` (the default) and a BTC price is available,
 * the amount is converted to USD. If the price hasn't loaded yet or the request
 * failed, the function falls back to the sats representation so we never block
 * the UI on a network round-trip.
 *
 * The BTC price is fetched via TanStack Query with a `['btc-price', esploraApis]`
 * key — the same key used by the wallet, zap dialogs, and on-chain zap flows — so
 * a single request is deduped across the whole app.
 *
 * The fetch is **on-demand**: dozens of components call this hook (feed cards,
 * action bars, notifications, embeds) but most render zero zaps and have
 * nothing to convert. Rather than hitting mempool.space/blockstream on every
 * page load regardless of whether a dollar amount is ever shown, the query
 * stays disabled until `format()` is actually called with a positive amount —
 * which callers only do once they know there's something to display (they all
 * already guard with `amount > 0` before rendering). Once any caller needs a
 * price, the shared query key means every other instance benefits from the
 * same cached fetch.
 */
export function useFormatMoney(): FormatMoneyResult {
  const { config } = useAppContext();
  const currency: CurrencyDisplay = config.currencyDisplay ?? 'usd';

  // On-demand price fetching. The query stays disabled until a caller actually
  // formats a positive amount in USD mode, so pages that never display a dollar
  // value (a note with no zaps, sats-mode users) never hit the price endpoint.
  //
  // Signalling is a two-step latch so we never do a state update *during*
  // render (which would be unsafe if `format` were ever invoked inside another
  // component's render):
  //   1. `format()` sets a ref — an idempotent latch, safe to write in render.
  //   2. A commit-phase effect promotes that ref into state to enable the query.
  //
  // The effect intentionally has NO dependency array so it re-checks after
  // every commit. That is what makes asynchronously-arriving amounts work: the
  // amount (e.g. a zap total from useEventStats) often isn't known on the first
  // render, and a dependency-gated effect would never re-run to notice the ref
  // flipping later. Once enabled it's a cheap no-op.
  const wantsPriceRef = useRef(false);
  const [wantsPrice, setWantsPrice] = useState(false);
  // No dependency array is intentional (see comment above): the effect must
  // run after every commit to notice the ref latch. The `!wantsPrice` guard
  // makes the state update fire at most once, so there is no update loop —
  // which is the risk exhaustive-deps warns about here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (wantsPriceRef.current && !wantsPrice) {
      setWantsPrice(true);
    }
  });

  // Reuse the shared price query so all callers share one cached fetch.
  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price', config.esploraApis],
    queryFn: ({ signal }) => fetchBtcPrice(config.esploraApis, signal),
    // Prices move; 60 s is fine for display formatting.
    staleTime: 60_000,
    // Don't pop a UI error if the price endpoint is down; we just fall back to sats.
    retry: 1,
    enabled: currency === 'usd' && wantsPrice,
    // Round for display so small price wiggles between refetches don't change
    // the selected data identity — every NoteCard subscribes to this query,
    // and an unrounded price re-renders the entire feed on each refresh.
    // A $10 step on the BTC price is far below display precision for sats→USD.
    select: (price) => Math.round(price / 10) * 10,
  });

  const format = useCallback(
    (sats: number, options?: FormatMoneyOptions): string => {
      const layout = options?.layout ?? 'long';

      // First real USD amount to convert → latch the shared price query on.
      if (currency === 'usd' && Number.isFinite(sats) && sats > 0) {
        wantsPriceRef.current = true;
      }

      // USD mode with a known price → render dollars. We never round to zero
      // for a non-zero zap; show the cent value so the user sees that any zap
      // happened.
      if (currency === 'usd' && btcPrice && Number.isFinite(btcPrice) && btcPrice > 0) {
        return satsToUSD(sats, btcPrice);
      }

      // Sats mode, or USD mode without a price → render sats.
      if (layout === 'compact') {
        return formatNumber(sats);
      }
      return `${formatNumber(sats)} ${sats === 1 ? 'sat' : 'sats'}`;
    },
    [currency, btcPrice],
  );

  return { format, currency, btcPrice };
}
