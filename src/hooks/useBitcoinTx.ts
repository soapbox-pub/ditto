import { useQuery } from '@tanstack/react-query';

import { fetchTxDetail, fetchBtcPrice } from '@/lib/bitcoin';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * Fetch full transaction details for a Bitcoin txid via the configured
 * Esplora-compatible API (default: mempool.space). Also fetches the
 * current BTC/USD price for display.
 */
export function useBitcoinTx(txid: string) {
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;

  const { data: tx, isLoading, error } = useQuery({
    queryKey: ['bitcoin-tx-detail', esploraBaseUrl, txid],
    queryFn: () => fetchTxDetail(txid, esploraBaseUrl),
    enabled: !!txid,
    staleTime: 60_000,
  });

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price', esploraBaseUrl],
    queryFn: () => fetchBtcPrice(esploraBaseUrl),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return { tx, btcPrice, isLoading, error };
}
