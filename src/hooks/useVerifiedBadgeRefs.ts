import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { BADGE_AWARD_KIND } from '@/lib/badgeUtils';
import { isNostrId } from '@/lib/nostrId';
import { fetchAuthorWriteRelays, queryOutboxRelays } from '@/lib/outbox';

/** The parts of a profile badge reference needed to check its award. */
interface AwardedRef {
  aTag: string;
  eTag?: string;
  /** The badge definition's author — the only one who can award it. */
  pubkey: string;
}

/** How many issuers' outbox relays one profile may make us look in. */
const MAX_OUTBOX_ISSUERS = 8;

/** Whether `award` is the issuer's kind 8 awarding `ref` to `owner`. */
function awards(award: NostrEvent, ref: AwardedRef, owner: string): boolean {
  return award.id === ref.eTag
    && award.kind === BADGE_AWARD_KIND
    && award.pubkey === ref.pubkey
    && award.tags.some(([n, v]) => n === 'a' && v === ref.aTag)
    && award.tags.some(([n, v]) => n === 'p' && v === owner);
}

/**
 * Keep only the profile badges `owner` was actually awarded.
 *
 * A profile badges event is the owner's own list, so anyone can put any
 * issuer's badge on it. NIP-58 has clients check the kind 8 award each entry
 * points at: signed by the badge's issuer and naming the owner. Awards are
 * looked up in one query, then on the issuers' outbox relays for any that
 * weren't found, since issuers often publish only there.
 *
 * Refs are withheld until checked, so a claimed badge never flashes in.
 */
export function useVerifiedBadgeRefs<T extends AwardedRef>(owner: string | undefined, refs: T[]): {
  refs: T[];
  isLoading: boolean;
} {
  const { nostr } = useNostr();
  const candidates = useMemo(() => refs.filter((r) => isNostrId(r.eTag)), [refs]);
  const ids = useMemo(() => [...new Set(candidates.map((r) => r.eTag!))].sort(), [candidates]);

  const query = useQuery({
    queryKey: ['badge-awards-verify', owner ?? '', ids.join(',')],
    queryFn: async ({ signal }) => {
      const found = new Map<string, NostrEvent>();
      const add = (events: NostrEvent[]) => {
        for (const e of events) found.set(e.id, e);
      };

      add(await nostr.query(
        [{ kinds: [BADGE_AWARD_KIND], ids, limit: ids.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      ));

      const missingByIssuer = new Map<string, string[]>();
      for (const ref of candidates) {
        if (found.has(ref.eTag!)) continue;
        missingByIssuer.set(ref.pubkey, [...(missingByIssuer.get(ref.pubkey) ?? []), ref.eTag!]);
      }
      await Promise.all([...missingByIssuer].slice(0, MAX_OUTBOX_ISSUERS).map(async ([issuer, missing]) => {
        const relays = await fetchAuthorWriteRelays(nostr, issuer, signal);
        add(await queryOutboxRelays(
          nostr,
          relays,
          [{ kinds: [BADGE_AWARD_KIND], authors: [issuer], ids: missing, limit: missing.length }],
          AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        ));
      }));

      return found;
    },
    enabled: !!owner && ids.length > 0,
    staleTime: 10 * 60_000,
  });

  const verified = useMemo(() => {
    if (!owner || !query.data) return [];
    const found = query.data;
    return candidates.filter((ref) => {
      const award = found.get(ref.eTag!);
      return !!award && awards(award, ref, owner);
    });
  }, [owner, candidates, query.data]);

  return { refs: verified, isLoading: query.isLoading };
}
