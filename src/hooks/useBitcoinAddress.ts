import { useQuery } from '@tanstack/react-query';

import { fetchAddressDetail, fetchBtcPrice } from '@/lib/bitcoin';

/**
 * Fetch full address details (balance + recent txs) via the mempool.space API.
 * Also fetches the current BTC/USD price for display.
 */
export function useBitcoinAddress(address: string) {
  const { data: addressDetail, isLoading, error, refetch } = useQuery({
    queryKey: ['bitcoin-address-detail', address],
    queryFn: () => fetchAddressDetail(address),
    enabled: !!address,
    refetchInterval: 30_000,
  });

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price'],
    queryFn: fetchBtcPrice,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return { addressDetail, btcPrice, isLoading, error, refetch };
}
