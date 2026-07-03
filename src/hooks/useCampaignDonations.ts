import { useQuery } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { fetchAddressData } from '@/lib/esploraApi';
import { fetchBtcPrice } from '@/lib/bitcoinMoney';
import type { ParsedCampaign } from '@/lib/campaign';

interface CampaignDonationsResult {
  /**
   * Total satoshis raised, sourced from the cumulative on-chain amount
   * ever received by the campaign's `w` address (`chain_stats.funded_txo_sum`
   * from Esplora). This is the same source Agora uses for the headline
   * "raised" number.
   *
   * Properties of this source:
   *
   * - Donations count whether or not the donor publishes a kind 8333 receipt.
   * - The number does not regress when the beneficiary spends from the
   *   address (it tracks lifetime received, not current balance).
   * - Anyone who sends sats to the address contributes — address reuse
   *   trades off security here. Per the spec, campaign creators are
   *   expected to use a fresh wallet per campaign.
   *
   * Returns `0` for silent-payment-only campaigns: SP donations are
   * unlinkable by design and address balance is undefined there.
   */
  totalSats: number;
  /** Current BTC/USD price (forwarded so callers can convert without a second query). */
  btcPrice: number | undefined;
  /** True while either the address-balance fetch or the BTC price is in flight. */
  isLoading: boolean;
}

/**
 * Fetch a campaign's aggregate "raised" total from its on-chain `w`
 * address. Refreshes every 30 s so the progress bar stays roughly
 * current while the page is open.
 *
 * Returns zeros for silent-payment-only campaigns (per spec, aggregate
 * UI MUST be hidden — there's nothing to fetch).
 */
export function useCampaignDonations(campaign: ParsedCampaign | undefined): CampaignDonationsResult {
  const { config } = useAppContext();
  const { esploraApis } = config;

  const onchainAddress = campaign?.wallets.onchain?.value;

  const { data: addressData, isLoading: isAddressLoading } = useQuery({
    queryKey: ['bitcoin-balance', 'campaign', esploraApis, onchainAddress ?? ''],
    queryFn: ({ signal }) => fetchAddressData(onchainAddress!, esploraApis, signal),
    enabled: !!onchainAddress,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: btcPrice, isLoading: isPriceLoading } = useQuery({
    queryKey: ['btc-price', esploraApis],
    queryFn: ({ signal }) => fetchBtcPrice(esploraApis, signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const totalSats = onchainAddress ? (addressData?.totalReceived ?? 0) : 0;

  return {
    totalSats,
    btcPrice,
    isLoading: !!onchainAddress && (isAddressLoading || isPriceLoading),
  };
}
