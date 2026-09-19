/**
 * Which currency the wallet page is showing (Bitcoin or Monero).
 *
 * Persisted to `localStorage` per account rather than to the encrypted
 * settings event: it's a view preference, not a secret, and routing it through
 * NIP-78 would mean a relay round-trip before the page could decide which
 * balance to render — which is exactly the flash of wrong content the
 * preference exists to avoid.
 *
 * Keyed by pubkey so switching accounts doesn't carry the previous account's
 * choice over — one may have a Monero wallet and the other not.
 */
import { useCallback, useEffect, useState } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';

/** Currencies the wallet page can display. */
export type WalletCurrency = 'bitcoin' | 'monero';

const STORAGE_PREFIX = 'ditto:wallet-currency:';

function storageKey(pubkey: string): string {
  return `${STORAGE_PREFIX}${pubkey}`;
}

function readStored(pubkey: string): WalletCurrency {
  if (!pubkey) return 'bitcoin';
  try {
    const value = localStorage.getItem(storageKey(pubkey));
    return value === 'monero' ? 'monero' : 'bitcoin';
  } catch {
    return 'bitcoin';
  }
}

export function useWalletCurrency() {
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey ?? '';

  const [currency, setCurrencyState] = useState<WalletCurrency>(() => readStored(pubkey));

  // Re-read when the account changes.
  useEffect(() => {
    setCurrencyState(readStored(pubkey));
  }, [pubkey]);

  const setCurrency = useCallback(
    (next: WalletCurrency) => {
      setCurrencyState(next);
      if (!pubkey) return;
      try {
        localStorage.setItem(storageKey(pubkey), next);
      } catch {
        // Storage unavailable (private browsing, Lockdown Mode) — the choice
        // still applies for this session, it just won't be remembered.
      }
    },
    [pubkey],
  );

  return { currency, setCurrency };
}
