import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { nostrPubkeyToBitcoinAddress, fetchAddressData, fetchBtcPrice, fetchTransactions } from '@/lib/bitcoin';

/**
 * Hook that derives a Bitcoin Taproot address from the current user's Nostr
 * pubkey and fetches the on-chain balance from the configured Esplora-compatible
 * API (default: mempool.space).
 *
 * Balance auto-refreshes every 30 seconds while the component is mounted.
 * BTC/USD price refreshes every 60 seconds.
 */
export function useBitcoinWallet() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { esploraApis } = config;

  const bitcoinAddress = useMemo(() => {
    if (!user) return '';
    return nostrPubkeyToBitcoinAddress(user.pubkey);
  }, [user]);

  const {
    data: addressData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['bitcoin-balance', esploraApis, bitcoinAddress],
    queryFn: ({ signal }) => fetchAddressData(bitcoinAddress, esploraApis, signal),
    enabled: !!bitcoinAddress,
    refetchInterval: 30_000,
  });

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price', esploraApis],
    queryFn: ({ signal }) => fetchBtcPrice(esploraApis, signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const {
    data: transactions,
    isLoading: isLoadingTxs,
  } = useQuery({
    queryKey: ['bitcoin-txs', esploraApis, bitcoinAddress],
    queryFn: ({ signal }) => fetchTransactions(bitcoinAddress, esploraApis, signal),
    enabled: !!bitcoinAddress,
    refetchInterval: 30_000,
  });

  return {
    /** The derived bc1p... Taproot address. */
    bitcoinAddress,
    /** Balance and transaction data (undefined while loading). */
    addressData,
    /** Current BTC price in USD. */
    btcPrice,
    /** Transaction history for the address. */
    transactions,
    /** Whether the initial balance fetch is in progress. */
    isLoading,
    /** Whether transactions are still loading. */
    isLoadingTxs,
    /** Error from the balance query, if any. */
    error,
    /** Manually trigger a balance refresh. */
    refetch,
    /** The current user's hex pubkey (convenience). */
    pubkey: user?.pubkey ?? '',
  };
}
