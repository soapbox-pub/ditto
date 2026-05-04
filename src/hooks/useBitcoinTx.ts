import { useQuery } from '@tanstack/react-query';

import { fetchTxDetail, fetchBtcPrice } from '@/lib/bitcoin';

/**
 * Fetch full transaction details for a Bitcoin txid via the mempool.space API.
 * Also fetches the current BTC/USD price for display.
 */
export function useBitcoinTx(txid: string) {
  const { data: tx, isLoading, error } = useQuery({
    queryKey: ['bitcoin-tx-detail', txid],
    queryFn: () => fetchTxDetail(txid),
    enabled: !!txid,
    staleTime: 60_000,
  });

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price'],
    queryFn: fetchBtcPrice,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return { tx, btcPrice, isLoading, error };
}
