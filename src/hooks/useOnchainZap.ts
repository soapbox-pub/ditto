import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinSigner, isSignerCapabilityError, reportSignerUnsupported } from '@/hooks/useBitcoinSigner';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { notificationSuccess } from '@/lib/haptics';
import {
  nostrPubkeyToBitcoinAddress,
  fetchUTXOs,
  getFeeRates,
  buildUnsignedPsbt,
  finalizePsbt,
  broadcastTransaction,
  estimateFee,
} from '@/lib/bitcoin';
import type { FeeRates } from '@/lib/bitcoin';

export type OnchainFeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';

/**
 * Resolves the fee rate for a given speed preset from a FeeRates bundle.
 */
function feeRateForSpeed(rates: FeeRates, speed: OnchainFeeSpeed): number {
  switch (speed) {
    case 'fastest': return rates.fastestFee;
    case 'halfHour': return rates.halfHourFee;
    case 'hour': return rates.hourFee;
    case 'economy': return rates.economyFee;
  }
}

interface OnchainZapArgs {
  /** Amount to zap in satoshis. */
  amountSats: number;
  /** Optional comment to include in the kind 8333 event content. */
  comment?: string;
  /** Fee speed preset. Defaults to "halfHour". */
  feeSpeed?: OnchainFeeSpeed;
}

interface OnchainZapResult {
  /** The broadcast Bitcoin transaction ID. */
  txid: string;
  /** Fee paid in satoshis. */
  fee: number;
  /** The published kind 8333 event. */
  event: NostrEvent;
}

/**
 * Hook for sending on-chain (Bitcoin L1) zaps to a Nostr event or profile.
 *
 * Flow:
 *   1. Build, sign, and broadcast a Bitcoin transaction paying the target
 *      author's derived Taproot address.
 *   2. Publish a kind 8333 "onchain zap" event referencing the txid, the
 *      target event (`e` or `a` tag), and the recipient's pubkey.
 *
 * Unlike NIP-57 Lightning zaps, this works for *any* Nostr user — there is
 * no LNURL dependency because every pubkey has a derived Taproot address.
 */
export function useOnchainZap(
  target: NostrEvent,
  onSuccess?: () => void,
) {
  const { user } = useCurrentUser();
  const { canSignPsbt, signPsbt } = useBitcoinSigner();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isZapping, setIsZapping] = useState(false);
  const [progress, setProgress] = useState<'idle' | 'building' | 'signing' | 'broadcasting' | 'publishing'>('idle');

  const mutation = useMutation<OnchainZapResult, Error, OnchainZapArgs>({
    mutationFn: async ({ amountSats, comment = '', feeSpeed = 'halfHour' }) => {
      if (!user) throw new Error('You must be logged in to zap.');
      if (user.pubkey === target.pubkey) throw new Error("You can't zap yourself.");
      if (!canSignPsbt || !signPsbt) {
        throw new Error(
          "Your login doesn't support sending Bitcoin. Log in with your secret key to send Bitcoin zaps.",
        );
      }
      if (!Number.isFinite(amountSats) || amountSats <= 0) {
        throw new Error('Invalid amount.');
      }

      setIsZapping(true);
      setProgress('building');

      const senderAddress = nostrPubkeyToBitcoinAddress(user.pubkey);
      const recipientAddress = nostrPubkeyToBitcoinAddress(target.pubkey);
      if (!senderAddress || !recipientAddress) {
        throw new Error('Failed to derive Bitcoin address.');
      }

      // Fetch UTXOs and fee rates
      const [utxos, rates] = await Promise.all([
        fetchUTXOs(senderAddress),
        getFeeRates(),
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

      // Build unsigned PSBT
      const { psbtHex, fee } = buildUnsignedPsbt(
        user.pubkey,
        recipientAddress,
        amountSats,
        utxos,
        feeRate,
      );

      // Sign
      setProgress('signing');
      const signedHex = await signPsbt(psbtHex);
      const txHex = finalizePsbt(signedHex);

      // Broadcast
      setProgress('broadcasting');
      const txid = await broadcastTransaction(txHex);

      // Publish kind 8333 event
      setProgress('publishing');
      const isAddressable = target.kind >= 30000 && target.kind < 40000;

      const tags: string[][] = [
        ['i', `bitcoin:tx:${txid}`],
        ['p', target.pubkey],
        ['amount', String(amountSats)],
      ];

      if (isAddressable) {
        const dTag = target.tags.find(([n]) => n === 'd')?.[1] ?? '';
        tags.push(['a', `${target.kind}:${target.pubkey}:${dTag}`]);
      }

      // Always include `e` for a concrete event reference (even for addressable events)
      tags.push(['e', target.id]);

      tags.push(['alt', `Bitcoin zap: ${amountSats.toLocaleString()} sats`]);

      const event = await publishEvent({
        kind: 8333,
        content: comment,
        tags,
      });

      return { txid, fee, event };
    },
    onSuccess: ({ txid, fee }) => {
      notificationSuccess();
      toast({
        title: 'Bitcoin zap sent!',
        description: `Broadcast txid ${txid.slice(0, 12)}… (fee ${fee.toLocaleString()} sats)`,
      });
      // Invalidate caches that track zaps / balances
      queryClient.invalidateQueries({ queryKey: ['onchain-zaps'] });
      queryClient.invalidateQueries({ queryKey: ['event-interactions'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-utxos'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-balance'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-txs'] });
      onSuccess?.();
    },
    onError: (err) => {
      // If the signer turned out to not support PSBT signing (common for
      // NIP-46 bunkers where capability can't be probed up front), mark the
      // signer as unsupported for the rest of the session. The dialog UI
      // watches this state and replaces itself with an "unsupported" panel
      // instead of relying on this toast.
      if (isSignerCapabilityError(err) && user) {
        reportSignerUnsupported(user.pubkey);
        return;
      }
      toast({
        title: 'Bitcoin zap failed',
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
    canZap: !!user && user.pubkey !== target.pubkey && canSignPsbt,
    /** Whether the logged-in user has a PSBT-capable signer. */
    canSignPsbt,
  };
}
