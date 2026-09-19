import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import {
  PAYMENT_TARGETS_KIND,
  findMoneroTarget,
  parsePaymentTargets,
} from '@/lib/paymentTargets';

const EMPTY: ReadonlyMap<string, string> = new Map();

/**
 * Resolve Monero addresses for a batch of pubkeys, from their NIP-A3 payment
 * targets (kind 10133).
 *
 * The Bitcoin send flow derives a recipient address from a pubkey arithmetically,
 * so every Nostr profile is payable and the picker can list search results
 * as-is. Monero has no such derivation: an address exists only if its owner
 * published one. That makes the lookup a prerequisite for *rendering* the
 * suggestion list, not just for sending — a row for someone who can't be paid
 * is a dead end.
 *
 * One filter for the whole result set rather than a query per row: a typeahead
 * turns over its suggestions on every keystroke, and fanning that out would be
 * a round-trip per profile per character.
 *
 * Kind 10133 is replaceable, so a relay set can legitimately return several
 * versions of one author's event; the newest wins. No `authors` filter concern
 * here beyond the one already applied — each address is read from the event its
 * own author signed, which is the only party whose Monero address this could
 * be.
 */
export function useMoneroAddresses(pubkeys: string[]) {
  // Sorted and deduplicated so the query key is stable across reorderings of
  // the same set — a re-sorted search result shouldn't refetch.
  const authors = useMemo(() => [...new Set(pubkeys)].sort(), [pubkeys]);

  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['monero-addresses', authors],
    queryFn: async (c) => {
      const events = await nostr.query(
        [{ kinds: [PAYMENT_TARGETS_KIND], authors }],
        { signal: c.signal },
      );

      const newest = new Map<string, { createdAt: number; address: string }>();

      for (const event of events) {
        const address = findMoneroTarget(parsePaymentTargets(event))?.authority;
        if (!address) continue;
        const prev = newest.get(event.pubkey);
        if (prev && prev.createdAt >= event.created_at) continue;
        newest.set(event.pubkey, { createdAt: event.created_at, address });
      }

      return new Map([...newest].map(([pubkey, { address }]) => [pubkey, address]));
    },
    enabled: authors.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  return {
    /** Pubkey → Monero address, for the pubkeys that published one. */
    addresses: (query.data ?? EMPTY) as ReadonlyMap<string, string>,
    /** True while the first lookup for this set of pubkeys is in flight. */
    isLoading: authors.length > 0 && query.isLoading,
  };
}
