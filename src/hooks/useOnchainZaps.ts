import { useQueries, useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { fetchTxDetail, nostrPubkeyToBitcoinAddress } from '@/lib/bitcoin';

/** A single verified on-chain zap, with the amount that actually paid the recipient on-chain. */
export interface OnchainZapEntry {
  /** The kind 3043 event. */
  event: NostrEvent;
  /** Bitcoin transaction id (lowercase hex). */
  txid: string;
  /** Pubkey of the sender (the 3043 event author). */
  senderPubkey: string;
  /** Pubkey of the recipient (from `p` tag). */
  recipientPubkey: string;
  /** Verified amount in sats — sum of tx outputs that pay the recipient's derived Taproot address. */
  amountSats: number;
  /** Sender's self-reported amount (may differ from verified). */
  claimedAmountSats: number;
  /** Comment from the 3043 event content. */
  comment: string;
  /** Unix timestamp of the 3043 event. */
  createdAt: number;
  /** Whether the Bitcoin tx is confirmed on-chain. */
  confirmed: boolean;
}

/** Parse the txid from a kind 3043 event's `i` tag. Returns null if missing or malformed. */
export function extractOnchainZapTxid(event: NostrEvent): string | null {
  const iTag = event.tags.find(([n, v]) => n === 'i' && typeof v === 'string' && v.startsWith('bitcoin:tx:'));
  if (!iTag?.[1]) return null;
  const txid = iTag[1].slice('bitcoin:tx:'.length).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txid)) return null;
  return txid;
}

/** Parse the claimed amount (sats) from a kind 3043 event. */
export function extractOnchainZapClaimedAmount(event: NostrEvent): number {
  const tag = event.tags.find(([n]) => n === 'amount');
  if (!tag?.[1]) return 0;
  const n = parseInt(tag[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Parse the recipient pubkey from a kind 3043 event (first `p` tag). */
export function extractOnchainZapRecipient(event: NostrEvent): string {
  const tag = event.tags.find(([n]) => n === 'p');
  return tag?.[1] ?? '';
}

/**
 * Verify a kind 3043 on-chain zap event against the Bitcoin blockchain.
 *
 * Returns the verified amount (sum of tx outputs paying the recipient's
 * derived Taproot address) and confirmation status. Returns `null` if the
 * event is malformed or the transaction cannot be verified.
 *
 * A verified amount of 0 means the transaction exists but does not pay
 * the claimed recipient — callers should discard such events.
 */
export async function verifyOnchainZap(event: NostrEvent): Promise<OnchainZapEntry | null> {
  const txid = extractOnchainZapTxid(event);
  const recipientPubkey = extractOnchainZapRecipient(event);
  if (!txid || !recipientPubkey) return null;

  const recipientAddress = nostrPubkeyToBitcoinAddress(recipientPubkey);
  if (!recipientAddress) return null;

  let detail;
  try {
    detail = await fetchTxDetail(txid);
  } catch {
    return null;
  }

  const amountSats = detail.outputs
    .filter((o) => o.address === recipientAddress)
    .reduce((sum, o) => sum + o.value, 0);

  if (amountSats === 0) return null;

  const claimed = extractOnchainZapClaimedAmount(event);
  // If the sender is claiming more than the tx actually paid, cap it at the verified amount.
  const effectiveClaim = Math.min(claimed || amountSats, amountSats);

  return {
    event,
    txid,
    senderPubkey: event.pubkey,
    recipientPubkey,
    amountSats: effectiveClaim,
    claimedAmountSats: claimed,
    comment: event.content,
    createdAt: event.created_at,
    confirmed: detail.confirmed,
  };
}

/**
 * Query all kind 3043 on-chain zaps targeting a specific event, then verify
 * each one on-chain. Returns only verified entries (deduped by txid).
 */
export function useOnchainZaps(target: NostrEvent | undefined) {
  const { nostr } = useNostr();
  const isAddressable = target && target.kind >= 30000 && target.kind < 40000;
  const dTag = isAddressable
    ? target.tags.find(([n]) => n === 'd')?.[1] ?? ''
    : '';
  const aCoord = isAddressable && target ? `${target.kind}:${target.pubkey}:${dTag}` : '';

  // Step 1: fetch the raw kind 3043 events for this target
  const eventsQuery = useQuery({
    queryKey: ['onchain-zaps', 'events', target?.id ?? '', aCoord],
    queryFn: async ({ signal }) => {
      if (!target) return [] as NostrEvent[];
      const timeout = AbortSignal.timeout(5000);
      const combined = AbortSignal.any([signal, timeout]);

      const filters: Parameters<typeof nostr.query>[0] = [
        { kinds: [3043], '#e': [target.id], limit: 100 },
      ];
      if (aCoord) {
        filters.push({ kinds: [3043], '#a': [aCoord], limit: 100 });
      }

      const events = await nostr.query(filters, { signal: combined });

      // Dedupe by event id, then by txid (one canonical zap per tx per target).
      const byId = new Map<string, NostrEvent>();
      for (const e of events) byId.set(e.id, e);

      const byTxid = new Map<string, NostrEvent>();
      for (const e of byId.values()) {
        const txid = extractOnchainZapTxid(e);
        if (!txid) continue;
        const existing = byTxid.get(txid);
        // Prefer the earliest event for each txid (first to claim this tx).
        if (!existing || e.created_at < existing.created_at) {
          byTxid.set(txid, e);
        }
      }

      return Array.from(byTxid.values());
    },
    enabled: !!target,
    staleTime: 30_000,
  });

  // Step 2: verify each event on-chain (parallel, cached per txid)
  const events = eventsQuery.data ?? [];
  const verifications = useQueries({
    queries: events.map((event) => ({
      queryKey: ['onchain-zaps', 'verify', extractOnchainZapTxid(event), extractOnchainZapRecipient(event)],
      queryFn: () => verifyOnchainZap(event),
      staleTime: 60_000,
    })),
  });

  const verified: OnchainZapEntry[] = verifications
    .map((v) => v.data)
    .filter((v): v is OnchainZapEntry => !!v);

  // Sort by verified amount (largest first)
  verified.sort((a, b) => b.amountSats - a.amountSats);

  const totalSats = verified.reduce((s, v) => s + v.amountSats, 0);
  const isLoading = eventsQuery.isLoading || verifications.some((v) => v.isLoading);

  return {
    zaps: verified,
    totalSats,
    count: verified.length,
    isLoading,
  };
}
