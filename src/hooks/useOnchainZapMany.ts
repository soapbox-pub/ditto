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
  nostrPubkeyToBitcoinAddress,
  fetchUTXOs,
  getFeeRates,
  buildUnsignedPsbtMulti,
  finalizePsbt,
  broadcastTransaction,
  estimateFee,
  type PsbtRecipient,
  type FeeRates,
} from '@/lib/bitcoin';
import type { OnchainFeeSpeed } from '@/hooks/useOnchainZap';

/**
 * Resolves the fee rate for a given speed preset from a FeeRates bundle.
 * Duplicated from useOnchainZap.ts to avoid a circular import.
 */
function feeRateForSpeed(rates: FeeRates, speed: OnchainFeeSpeed): number {
  switch (speed) {
    case 'fastest': return rates.fastestFee;
    case 'halfHour': return rates.halfHourFee;
    case 'hour': return rates.hourFee;
    case 'economy': return rates.economyFee;
  }
}

interface OnchainZapManyArgs {
  /** Recipient pubkeys (hex). The sender is filtered out automatically. */
  recipientPubkeys: string[];
  /** Amount to send to *each* recipient in satoshis. */
  amountPerRecipientSats: number;
  /**
   * Optional comment included verbatim in every kind 8333 event published
   * for this transaction.
   */
  comment?: string;
  /** Fee speed preset. Defaults to "halfHour". */
  feeSpeed?: OnchainFeeSpeed;
  /**
   * Optional target event. When supplied, the published kind 8333 events
   * carry `e` (and `a` for addressable) tags pointing at this event so the
   * onchain-zap totals on that event aggregate the batch. When omitted, the
   * events are profile-level zaps with only `p` tags.
   */
  target?: NostrEvent;
}

interface OnchainZapManyResult {
  /** The single broadcast Bitcoin transaction ID. */
  txid: string;
  /** Total amount paid across all recipients in satoshis. */
  totalAmountSats: number;
  /** Per-recipient amount in satoshis. */
  amountPerRecipientSats: number;
  /** Number of recipients actually paid. */
  recipientCount: number;
  /** Network fee paid in satoshis. */
  fee: number;
  /**
   * The published kind 8333 event, or `null` if the relay rejected the
   * publish. The on-chain payment has already cleared regardless.
   */
  event: NostrEvent | null;
}

/**
 * Hook for sending an on-chain zap to many recipients with a single
 * Bitcoin transaction.
 *
 * Flow:
 *   1. Build one PSBT with N outputs — one per recipient + change — paying
 *      each recipient's derived Taproot address.
 *   2. Sign once, broadcast once.
 *   3. Publish ONE kind 8333 event with every recipient listed as a `p`
 *      tag, per NIP-BC's multi-recipient form. The `amount` tag is the
 *      total paid across all listed recipients. Per-recipient amounts are
 *      not encoded — verifiers recompute them on demand by matching each
 *      recipient's derived Taproot address against the on-chain tx.
 *
 * Sender deduplication: the sender's own pubkey is filtered out of the
 * recipient list (sending Bitcoin to yourself is wasteful and the spec
 * says clients SHOULD reject events whose sender appears in any `p` tag).
 */
export function useOnchainZapMany(
  onSuccess?: (result: OnchainZapManyResult) => void,
) {
  const { user } = useCurrentUser();
  const { canSignPsbt, signPsbt } = useBitcoinSigner();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;
  const queryClient = useQueryClient();

  const [isZapping, setIsZapping] = useState(false);
  const [progress, setProgress] = useState<
    'idle' | 'building' | 'signing' | 'broadcasting' | 'publishing'
  >('idle');

  const mutation = useMutation<OnchainZapManyResult, Error, OnchainZapManyArgs>({
    mutationFn: async ({
      recipientPubkeys,
      amountPerRecipientSats,
      comment = '',
      feeSpeed = 'halfHour',
      target,
    }) => {
      if (!user) throw new Error('You must be logged in to zap.');
      if (!canSignPsbt || !signPsbt) {
        throw new Error(
          "Your login doesn't support sending Bitcoin. Log in with your secret key to send Bitcoin zaps.",
        );
      }
      if (!Number.isFinite(amountPerRecipientSats) || amountPerRecipientSats <= 0) {
        throw new Error('Invalid amount.');
      }

      // De-duplicate and remove self.
      const recipients = Array.from(
        new Set(recipientPubkeys.filter((pk) => pk !== user.pubkey)),
      );
      if (recipients.length === 0) {
        throw new Error('No valid recipients (the list is empty or only contains you).');
      }

      setIsZapping(true);
      setProgress('building');

      const senderAddress = nostrPubkeyToBitcoinAddress(user.pubkey);
      if (!senderAddress) {
        throw new Error('Failed to derive your Bitcoin address.');
      }

      // Resolve each recipient to a Taproot address. Drop any that fail to
      // derive (shouldn't happen for valid 32-byte hex pubkeys, but be safe).
      const psbtRecipients: PsbtRecipient[] = [];
      const recipientPubkeysOrdered: string[] = [];
      for (const pk of recipients) {
        const addr = nostrPubkeyToBitcoinAddress(pk);
        if (!addr) continue;
        psbtRecipients.push({ address: addr, amountSats: amountPerRecipientSats });
        recipientPubkeysOrdered.push(pk);
      }
      if (psbtRecipients.length === 0) {
        throw new Error('Failed to derive Bitcoin addresses for any recipient.');
      }

      // Fetch UTXOs and fee rates in parallel.
      const [utxos, rates] = await Promise.all([
        fetchUTXOs(senderAddress, esploraBaseUrl),
        getFeeRates(esploraBaseUrl),
      ]);

      if (utxos.length === 0) {
        throw new Error('Your Bitcoin wallet has no spendable funds.');
      }

      const feeRate = feeRateForSpeed(rates, feeSpeed);
      const totalBalance = utxos.reduce((s, u) => s + u.value, 0);
      const totalOut = amountPerRecipientSats * psbtRecipients.length;
      const estFee = estimateFee(utxos.length, psbtRecipients.length + 1, feeRate);
      if (totalOut + estFee > totalBalance) {
        throw new Error(
          `Insufficient funds. Need ~${(totalOut + estFee).toLocaleString()} sats, have ${totalBalance.toLocaleString()}.`,
        );
      }

      // Build the multi-output PSBT.
      const { psbtHex, fee } = buildUnsignedPsbtMulti(
        user.pubkey,
        psbtRecipients,
        utxos,
        feeRate,
      );

      // Sign + finalize + broadcast.
      setProgress('signing');
      const signedHex = await signPsbt(psbtHex);
      const txHex = finalizePsbt(signedHex);

      setProgress('broadcasting');
      const txid = await broadcastTransaction(txHex, esploraBaseUrl);

      // Publish ONE kind 8333 event with every recipient listed as a `p`
      // tag, per the updated NIP-BC spec. The `amount` tag is the total
      // paid across all listed recipients (sum of their outputs in the tx).
      // Verifiers recompute per-recipient amounts on demand by matching each
      // pubkey's derived Taproot address against the tx outputs.
      setProgress('publishing');
      const isAddressable = target && target.kind >= 30000 && target.kind < 40000;
      const aCoord = isAddressable
        ? (() => {
            const dTag = target!.tags.find(([n]) => n === 'd')?.[1] ?? '';
            return `${target!.kind}:${target!.pubkey}:${dTag}`;
          })()
        : undefined;

      const totalAmountSats = amountPerRecipientSats * recipientPubkeysOrdered.length;

      const tags: string[][] = [
        ['i', `bitcoin:tx:${txid}`],
        // One `p` tag per recipient. Verifiers sum tx outputs across ALL
        // listed recipients' derived addresses.
        ...recipientPubkeysOrdered.map((pk) => ['p', pk]),
        ['amount', String(totalAmountSats)],
      ];

      if (target) {
        if (aCoord) tags.push(['a', aCoord]);
        tags.push(['e', target.id]);
        // NIP-BC's optional `k` tag — the target event's kind, mirroring
        // NIP-57. Helps clients filter zaps by target kind without a
        // second lookup.
        tags.push(['k', String(target.kind)]);
      }

      tags.push([
        'alt',
        `Onchain zap: ${totalAmountSats.toLocaleString()} sats across ${recipientPubkeysOrdered.length} ${
          recipientPubkeysOrdered.length === 1 ? 'recipient' : 'recipients'
        }`,
      ]);

      let publishedEvent: NostrEvent | null = null;
      try {
        publishedEvent = await publishEvent({
          kind: 8333,
          content: comment,
          tags,
        });
      } catch (err) {
        // The on-chain payment already cleared, so a relay rejection isn't
        // fatal — the zap exists on Bitcoin regardless. Surface a console
        // warning and let the success path return without an event.
        console.warn('Failed to publish kind 8333 multi-recipient zap', err);
      }

      return {
        txid,
        totalAmountSats,
        amountPerRecipientSats,
        recipientCount: recipientPubkeysOrdered.length,
        fee,
        event: publishedEvent,
      };
    },
    onSuccess: (result) => {
      notificationSuccess();
      // Invalidate caches: each recipient's onchain zap totals, the target
      // event's interactions, and the sender's wallet balance.
      queryClient.invalidateQueries({ queryKey: ['onchain-zaps'] });
      queryClient.invalidateQueries({ queryKey: ['event-interactions'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-utxos'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-balance'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-txs'] });

      if (onSuccess) {
        onSuccess(result);
      } else {
        toast({
          title: 'Zapped all!',
          description: `Sent ${result.totalAmountSats.toLocaleString()} sats to ${result.recipientCount} ${
            result.recipientCount === 1 ? 'account' : 'accounts'
          }. Tx ${result.txid.slice(0, 12)}…`,
        });
      }
    },
    onError: (err) => {
      if (isSignerCapabilityError(err) && user) {
        reportSignerUnsupported(user.pubkey);
        return;
      }
      toast({
        title: 'Zap all failed',
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
    canZap: !!user && canSignPsbt,
    canSignPsbt,
  };
}
