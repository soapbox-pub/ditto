import { useQuery } from '@tanstack/react-query';

import { fetchAddressDetail, fetchBtcPrice } from '@/lib/bitcoin';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * Fetch full address details (balance + recent txs) via the configured
 * Esplora-compatible API (default: mempool.space). Also fetches the
 * current BTC/USD price for display.
 */
export function useBitcoinAddress(address: string) {
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;

  const { data: addressDetail, isLoading, error, refetch } = useQuery({
    queryKey: ['bitcoin-address-detail', esploraBaseUrl, address],
    queryFn: () => fetchAddressDetail(address, esploraBaseUrl),
    enabled: !!address,
    refetchInterval: 30_000,
  });

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price', esploraBaseUrl],
    queryFn: () => fetchBtcPrice(esploraBaseUrl),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return { addressDetail, btcPrice, isLoading, error, refetch };
}
