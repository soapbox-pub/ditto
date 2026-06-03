import { useQueries, useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { fetchTxDetail, nostrPubkeyToBitcoinAddress } from '@/lib/bitcoin';
import { useAppContext } from '@/hooks/useAppContext';
import { isNostrId } from '@/lib/nostrId';
/** A single verified on-chain zap, with the amount that actually paid the recipient on-chain. */
export interface OnchainZapEntry {
  /** The kind 8333 event. */
  event: NostrEvent;
  /** Bitcoin transaction id (lowercase hex). */
  txid: string;
  /** Pubkey of the sender (the 8333 event author). */
  senderPubkey: string;
  /**
   * Pubkey of the primary recipient — the first `p` tag in the event.
   * For multi-recipient zaps, see {@link recipientPubkeys} for the full list.
   */
  recipientPubkey: string;
  /**
   * All recipient pubkeys from the event's `p` tags, in event order.
   * Single-recipient events have one entry; multi-recipient (NIP-BC
   * batch) zaps have many.
   */
  recipientPubkeys: string[];
  /**
   * Verified amount in sats — sum of tx outputs that pay any of the listed
   * recipients' derived Taproot addresses. For multi-recipient events this
   * is the *total* paid across all recipients (matches the `amount` tag
   * semantic in the spec).
   */
  amountSats: number;
  /** Sender's self-reported amount (may differ from verified). */
  claimedAmountSats: number;
  /** Comment from the 8333 event content. */
  comment: string;
  /** Unix timestamp of the 8333 event. */
  createdAt: number;
  /** Whether the Bitcoin tx is confirmed on-chain. */
  confirmed: boolean;
}

/** Parse the txid from a kind 8333 event's `i` tag. Returns null if missing or malformed. */
export function extractOnchainZapTxid(event: NostrEvent): string | null {
  const iTag = event.tags.find(([n, v]) => n === 'i' && typeof v === 'string' && v.startsWith('bitcoin:tx:'));
  if (!iTag?.[1]) return null;
  const txid = iTag[1].slice('bitcoin:tx:'.length).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txid)) return null;
  return txid;
}

/** Parse the claimed amount (sats) from a kind 8333 event. */
export function extractOnchainZapClaimedAmount(event: NostrEvent): number {
  const tag = event.tags.find(([n]) => n === 'amount');
  if (!tag?.[1]) return 0;
  const n = parseInt(tag[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Parse the **primary** recipient pubkey from a kind 8333 event — the first
 * valid `p` tag. Most rendering code wants this single value (sender X
 * "zapped" recipient Y) and falls back to the avatar-stack treatment only
 * when the event is multi-recipient.
 */
export function extractOnchainZapRecipient(event: NostrEvent): string {
  return extractOnchainZapRecipients(event)[0] ?? '';
}

/**
 * Parse **all** recipient pubkeys from a kind 8333 event's `p` tags, in
 * event order. Malformed hex is dropped — anything that wouldn't be safe
 * to pass to `nostrPubkeyToBitcoinAddress` or `nip19.npubEncode` is
 * filtered at the boundary so downstream renderers can assume the values
 * are well-formed.
 */
export function extractOnchainZapRecipients(event: NostrEvent): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== 'p') continue;
    const pk = tag[1];
    if (!pk || !isNostrId(pk)) continue;
    if (seen.has(pk)) continue;
    seen.add(pk);
    out.push(pk);
  }
  return out;
}

/**
 * Verify a kind 8333 on-chain zap event against the Bitcoin blockchain.
 *
 * Per NIP-BC, the verified amount is the sum of tx outputs paying the
 * derived Taproot addresses of **all** listed `p` recipients combined.
 * Self-zaps are rejected (sender appearing in any `p` tag), and outputs
 * paying back to the sender's own address are excluded as change.
 *
 * Returns `null` if the event is malformed, the transaction can't be
 * fetched, or none of the listed recipients received anything on-chain.
 *
 * @param event       The kind 8333 event to verify.
 * @param esploraApis Ordered list of Esplora REST roots used to fetch the tx detail.
 * @param signal      Optional abort signal (e.g. from TanStack Query).
 */
export async function verifyOnchainZap(
  event: NostrEvent,
  esploraApis: string[],
  signal?: AbortSignal,
): Promise<OnchainZapEntry | null> {
  const txid = extractOnchainZapTxid(event);
  const recipientPubkeys = extractOnchainZapRecipients(event);
  if (!txid || recipientPubkeys.length === 0) return null;

  // Reject self-zaps — the sender's pubkey appearing in ANY p tag means
  // they're paying themselves, which is trivial to fabricate.
  if (recipientPubkeys.includes(event.pubkey)) return null;

  // Derive the expected Taproot address for each recipient, plus the
  // sender's so we can exclude change outputs.
  const recipientAddresses = new Set<string>();
  for (const pk of recipientPubkeys) {
    const addr = nostrPubkeyToBitcoinAddress(pk);
    if (addr) recipientAddresses.add(addr);
  }
  if (recipientAddresses.size === 0) return null;

  const senderAddress = nostrPubkeyToBitcoinAddress(event.pubkey);

  let detail;
  try {
    detail = await fetchTxDetail(txid, esploraApis, signal);
  } catch {
    return null;
  }

  const amountSats = detail.outputs
    .filter((o) =>
      // Pay outputs only — exclude any output back to the sender (change)
      // regardless of whether it accidentally appears in the recipient set.
      o.address !== senderAddress && recipientAddresses.has(o.address ?? ''),
    )
    .reduce((sum, o) => sum + o.value, 0);

  if (amountSats === 0) return null;

  const claimed = extractOnchainZapClaimedAmount(event);
  // If the sender is claiming more than the tx actually paid, cap it at the verified amount.
  const effectiveClaim = Math.min(claimed || amountSats, amountSats);

  return {
    event,
    txid,
    senderPubkey: event.pubkey,
    recipientPubkey: recipientPubkeys[0],
    recipientPubkeys,
    amountSats: effectiveClaim,
    claimedAmountSats: claimed,
    comment: event.content,
    createdAt: event.created_at,
    confirmed: detail.confirmed,
  };
}

/**
 * Query all kind 8333 on-chain zaps targeting a specific event, then verify
 * each one on-chain. Returns only verified entries (deduped by txid).
 */
export function useOnchainZaps(target: NostrEvent | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { esploraApis } = config;
  const isAddressable = target && target.kind >= 30000 && target.kind < 40000;
  const dTag = isAddressable
    ? target.tags.find(([n]) => n === 'd')?.[1] ?? ''
    : '';
  const aCoord = isAddressable && target ? `${target.kind}:${target.pubkey}:${dTag}` : '';

  // Step 1: fetch the raw kind 8333 events for this target
  const eventsQuery = useQuery({
    queryKey: ['onchain-zaps', 'events', target?.id ?? '', aCoord],
    queryFn: async ({ signal }) => {
      if (!target) return [] as NostrEvent[];
      const timeout = AbortSignal.timeout(5000);
      const combined = AbortSignal.any([signal, timeout]);

      const filters: Parameters<typeof nostr.query>[0] = [
        { kinds: [8333], '#e': [target.id], limit: 100 },
      ];
      if (aCoord) {
        filters.push({ kinds: [8333], '#a': [aCoord], limit: 100 });
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

  // Step 2: verify each event on-chain (parallel, cached per (txid, recipients))
  const events = eventsQuery.data ?? [];
  const verifications = useQueries({
    queries: events.map((event) => ({
      queryKey: [
        'onchain-zaps',
        'verify',
        esploraApis,
        extractOnchainZapTxid(event),
        // Include the full sorted recipient list so a multi-recipient event
        // doesn't collide with a single-recipient event that happens to
        // share the first `p`. Sorted because order doesn't affect verification.
        extractOnchainZapRecipients(event).slice().sort().join(','),
      ],
      queryFn: ({ signal }) => verifyOnchainZap(event, esploraApis, signal),
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

/**
 * Verify a single kind 8333 event against the Bitcoin blockchain and return
 * the resulting `OnchainZapEntry`. Used by standalone surfaces (embedded
 * cards, detail page) that need to display a verified amount without doing
 * a full `#e`/`#a` fan-out.
 *
 * Returns `undefined` while loading, `null` if the event fails verification
 * (invalid tx, wrong recipient, self-zap, etc.), or the entry.
 */
export function useVerifiedOnchainZap(event: NostrEvent | undefined): OnchainZapEntry | null | undefined {
  const { config } = useAppContext();
  const { esploraApis } = config;
  const txid = event ? extractOnchainZapTxid(event) : null;
  const recipients = event ? extractOnchainZapRecipients(event) : [];
  const recipientsKey = recipients.slice().sort().join(',');

  const { data } = useQuery({
    queryKey: ['onchain-zaps', 'verify', esploraApis, txid, recipientsKey],
    queryFn: ({ signal }) => verifyOnchainZap(event!, esploraApis, signal),
    enabled: !!event && !!txid && recipients.length > 0,
    staleTime: 60_000,
  });

  if (!event) return null;
  return data;
}
