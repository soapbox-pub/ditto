import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { nostrPubkeyToBitcoinAddress, fetchAddressData } from '@/lib/bitcoin';

/**
 * Hook that derives a Bitcoin Taproot address from the current user's Nostr
 * pubkey and fetches the on-chain balance from the Blockstream API.
 *
 * Balance auto-refreshes every 30 seconds while the component is mounted.
 */
export function useBitcoinWallet() {
  const { user } = useCurrentUser();

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
    queryKey: ['bitcoin-balance', bitcoinAddress],
    queryFn: () => fetchAddressData(bitcoinAddress),
    enabled: !!bitcoinAddress,
    refetchInterval: 30_000,
  });

  return {
    /** The derived bc1p... Taproot address. */
    bitcoinAddress,
    /** Balance and transaction data (undefined while loading). */
    addressData,
    /** Whether the initial balance fetch is in progress. */
    isLoading,
    /** Error from the balance query, if any. */
    error,
    /** Manually trigger a balance refresh. */
    refetch,
    /** The current user's hex pubkey (convenience). */
    pubkey: user?.pubkey ?? '',
  };
}
