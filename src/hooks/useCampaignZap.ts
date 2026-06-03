import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinSigner, isSignerCapabilityError, reportSignerUnsupported } from '@/hooks/useBitcoinSigner';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useAppContext } from '@/hooks/useAppContext';
import { notificationSuccess } from '@/lib/haptics';
import {
  buildUnsignedPsbt,
  buildUnsignedSilentPaymentPsbt,
  broadcastTransaction,
  estimateFee,
  fetchUTXOs,
  finalizePsbt,
  getFeeRates,
  nostrPubkeyToBitcoinAddress,
  validateBitcoinAddress,
} from '@/lib/bitcoin';
import type { FeeRates } from '@/lib/bitcoin';
import { extractTxFromSignedPsbtV2 } from '@/lib/psbtV2';
import { CAMPAIGN_KIND, type ParsedCampaign } from '@/lib/campaign';

export type OnchainFeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';

function feeRateForSpeed(rates: FeeRates, speed: OnchainFeeSpeed): number {
  switch (speed) {
    case 'fastest': return rates.fastestFee;
    case 'halfHour': return rates.halfHourFee;
    case 'hour': return rates.hourFee;
    case 'economy': return rates.economyFee;
  }
}

interface CampaignZapArgs {
  /** Amount to donate in satoshis. */
  amountSats: number;
  /** Optional comment to include in the kind 8333 receipt's content (on-chain mode only). */
  comment?: string;
  /** Fee speed preset. Defaults to "halfHour". */
  feeSpeed?: OnchainFeeSpeed;
}

interface CampaignZapResult {
  /** The broadcast Bitcoin transaction ID. */
  txid: string;
  /** Amount sent in satoshis. */
  amountSats: number;
  /** Fee paid in satoshis. */
  fee: number;
  /** The kind 8333 receipt event, when published (on-chain only — SP donations
   *  intentionally publish no Nostr event per spec). */
  event?: NostrEvent;
  /** The rail used for the donation. */
  mode: 'onchain' | 'sp';
}

/**
 * Send a Bitcoin donation to a kind 33863 Fundraiser/Campaign from Ditto's
 * built-in PSBT-capable wallet.
 *
 * Pass `null` when the caller doesn't currently have a campaign in hand —
 * the hook returns no-op mutation handlers that throw if invoked. This
 * lets components conditionally route between {@link useOnchainZap} and
 * `useCampaignZap` without violating the rules of hooks.
 *
 * Rail selection:
 *
 * - If the campaign declares **both** an on-chain (`bc1…`) and a silent
 *   payment (`sp1…`) endpoint, the **on-chain** rail is preferred — it
 *   contributes to the campaign's public aggregate UI and the spec's
 *   example flow assumes on-chain when both are present.
 * - If only one endpoint is present, that one is used.
 *
 * Receipt publishing:
 *
 * - **On-chain mode** publishes a kind 8333 receipt in *campaign-wallet*
 *   form per `NIP.md` Kind 33863: `i` (txid), `amount`, `a` (campaign
 *   coordinate), `K` (`"33863"`), `alt`. **No `p` tags** — campaigns
 *   are not Nostr-identity recipients.
 * - **Silent-payment mode** publishes **no Nostr event**. Doing so would
 *   defeat the unlinkability the rail is designed to provide.
 *
 * Spec compliance: the campaign's parser already enforces mainnet
 * `bc1q…` / `bc1p…` checksums at parse time, but we re-validate the
 * on-chain endpoint here so a relay-corrupted campaign that somehow
 * reached the renderer can't quietly send to garbage. SP endpoints have
 * no client-side checksum verification (per parser); donor wallets fail
 * at output derivation if the code is malformed.
 */
export function useCampaignZap(
  campaign: ParsedCampaign | null,
  onSuccess?: (result: CampaignZapResult) => void,
) {
  const { user } = useCurrentUser();
  const { canSignPsbt, signPsbt } = useBitcoinSigner();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const { config } = useAppContext();
  const { esploraApis } = config;
  const queryClient = useQueryClient();

  const [isZapping, setIsZapping] = useState(false);
  const [progress, setProgress] = useState<'idle' | 'building' | 'signing' | 'broadcasting' | 'publishing'>('idle');

  const mutation = useMutation<CampaignZapResult, Error, CampaignZapArgs>({
    mutationFn: async ({ amountSats, comment = '', feeSpeed = 'halfHour' }) => {
      if (!campaign) throw new Error('No campaign to donate to.');
      if (!user) throw new Error('You must be logged in to donate.');
      if (!canSignPsbt || !signPsbt) {
        throw new Error(
          "Your login doesn't support sending Bitcoin. Log in with your secret key to donate from Ditto.",
        );
      }
      if (!Number.isFinite(amountSats) || amountSats <= 0) {
        throw new Error('Invalid amount.');
      }

      // Per the plan, prefer the on-chain rail when both are declared.
      const useOnchain = !!campaign.wallets.onchain;
      const wallet = useOnchain ? campaign.wallets.onchain! : campaign.wallets.sp!;
      if (!wallet) throw new Error('This campaign has no donatable endpoint.');

      // Re-validate the on-chain address — campaign-parser-level validation
      // already ran, but a relay round-trip or local-cache corruption could
      // have mutated bytes since. SP endpoints have no checksum we can
      // verify here; the donor wallet fails the derivation if malformed.
      if (useOnchain && !validateBitcoinAddress(wallet.value)) {
        throw new Error('Campaign wallet address failed validation.');
      }

      setIsZapping(true);
      setProgress('building');

      const senderAddress = nostrPubkeyToBitcoinAddress(user.pubkey);
      if (!senderAddress) throw new Error('Failed to derive sender Bitcoin address.');

      const [utxos, rates] = await Promise.all([
        fetchUTXOs(senderAddress, esploraApis),
        getFeeRates(esploraApis),
      ]);

      if (utxos.length === 0) {
        throw new Error('Your Bitcoin wallet has no spendable funds.');
      }

      const feeRate = feeRateForSpeed(rates, feeSpeed);
      const totalBalance = utxos.reduce((s, u) => s + u.value, 0);
      const estFee = estimateFee(utxos.length, 2, feeRate);
      if (amountSats + estFee > totalBalance) {
        throw new Error(
          `Insufficient funds. Need ~${(amountSats + estFee).toLocaleString()} sats, have ${totalBalance.toLocaleString()}.`,
        );
      }

      // Build PSBT per rail.
      let psbtHex: string;
      let fee: number;
      if (useOnchain) {
        ({ psbtHex, fee } = buildUnsignedPsbt(
          user.pubkey,
          wallet.value,
          amountSats,
          utxos,
          feeRate,
        ));
      } else {
        ({ psbtHex, fee } = buildUnsignedSilentPaymentPsbt(
          user.pubkey,
          wallet.value,
          amountSats,
          utxos,
          feeRate,
        ));
      }

      setProgress('signing');
      const signedHex = await signPsbt(psbtHex);

      // BIP-375 signers return a finalized PSBT v2 for SP sends; the legacy
      // signer path returns a PSBT v0 we hand to `finalizePsbt`.
      const txHex = useOnchain ? finalizePsbt(signedHex) : extractTxFromSignedPsbtV2(signedHex);

      setProgress('broadcasting');
      const txid = await broadcastTransaction(txHex, esploraApis);

      // Publish a kind 8333 receipt for on-chain donations only.
      let event: NostrEvent | undefined;
      if (useOnchain) {
        setProgress('publishing');
        const aTag = `${CAMPAIGN_KIND}:${campaign.pubkey}:${campaign.identifier}`;
        try {
          event = await publishEvent({
            kind: 8333,
            content: comment,
            tags: [
              ['i', `bitcoin:tx:${txid}`],
              ['amount', String(amountSats)],
              ['a', aTag],
              ['K', String(CAMPAIGN_KIND)],
              ['alt', `Donation to ${campaign.title}: ${amountSats.toLocaleString()} sats`],
            ],
          });
        } catch (err) {
          // The Bitcoin transaction already broadcast — the kind 8333 is a
          // best-effort attestation. Surface the failure in the console but
          // don't roll back: the donation stands on-chain regardless.
          console.warn('Failed to publish kind 8333 campaign receipt:', err);
        }
      }

      return { txid, amountSats, fee, event, mode: useOnchain ? 'onchain' : 'sp' };
    },
    onSuccess: (result) => {
      notificationSuccess();
      queryClient.invalidateQueries({ queryKey: ['onchain-zaps'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-utxos'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-balance'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-txs'] });
      if (campaign) {
        queryClient.invalidateQueries({
          queryKey: ['campaign-donations', `${CAMPAIGN_KIND}:${campaign.pubkey}:${campaign.identifier}`],
        });
      }
      if (onSuccess) {
        onSuccess(result);
      } else {
        toast({
          title: 'Donation sent!',
          description: `Broadcast txid ${result.txid.slice(0, 12)}… (fee ${result.fee.toLocaleString()} sats)`,
        });
      }
    },
    onError: (err) => {
      if (isSignerCapabilityError(err) && user) {
        reportSignerUnsupported(user.pubkey);
        return;
      }
      toast({
        title: 'Donation failed',
        description: err.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsZapping(false);
      setProgress('idle');
    },
  });

  return {
    zap: mutation.mutate,
    zapAsync: mutation.mutateAsync,
    isZapping,
    progress,
    /** Whether the current user can donate from the in-app wallet. */
    canZap: !!user && !!campaign && canSignPsbt,
    /** Whether the logged-in user has a PSBT-capable signer. */
    canSignPsbt,
  };
}
