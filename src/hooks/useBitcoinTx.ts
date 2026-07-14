import { useQuery } from '@tanstack/react-query';

import { fetchTxDetail } from '@/lib/esploraApi';
import { fetchBtcPrice } from '@/lib/bitcoinMoney';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * Fetch full transaction details for a Bitcoin txid via the configured
 * Esplora-compatible API (default: mempool.space). Also fetches the
 * current BTC/USD price for display.
 */
export function useBitcoinTx(txid: string) {
  const { config } = useAppContext();
  const { esploraApis } = config;

  const { data: tx, isLoading, error } = useQuery({
    queryKey: ['bitcoin-tx-detail', esploraApis, txid],
    queryFn: ({ signal }) => fetchTxDetail(txid, esploraApis, signal),
    enabled: !!txid,
    staleTime: 60_000,
  });

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price', esploraApis],
    queryFn: ({ signal }) => fetchBtcPrice(esploraApis, signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return { tx, btcPrice, isLoading, error };
}
