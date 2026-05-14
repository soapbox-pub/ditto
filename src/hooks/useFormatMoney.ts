import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { fetchBtcPrice, satsToUSD } from '@/lib/bitcoin';
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
 * The BTC price is fetched via TanStack Query with a `['btc-price', esploraBaseUrl]`
 * key — the same key used by the wallet, zap dialogs, and on-chain zap flows — so
 * a single request is deduped across the whole app.
 */
export function useFormatMoney(): FormatMoneyResult {
  const { config } = useAppContext();
  const currency: CurrencyDisplay = config.currencyDisplay ?? 'usd';

  // Reuse the shared price query so all callers share one cached fetch.
  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price', config.esploraBaseUrl],
    queryFn: () => fetchBtcPrice(config.esploraBaseUrl),
    // Prices move; 60 s is fine for display formatting.
    staleTime: 60_000,
    // Don't pop a UI error if the price endpoint is down; we just fall back to sats.
    retry: 1,
    enabled: currency === 'usd',
  });

  const format = useCallback(
    (sats: number, options?: FormatMoneyOptions): string => {
      const layout = options?.layout ?? 'long';

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
