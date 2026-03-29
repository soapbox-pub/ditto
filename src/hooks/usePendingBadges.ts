import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useProfileBadges } from '@/hooks/useProfileBadges';
import { BADGE_AWARD_KIND } from '@/lib/badgeUtils';

/** A pending (unaccepted) badge award. */
export interface PendingBadge {
  /** The `a` tag from the award event referencing the badge definition. */
  aTag: string;
  /** The kind 8 award event. */
  awardEvent: NostrEvent;
  /** Unix timestamp of when the award was issued. */
  awardedAt: number;
  /** Parsed components of the badge reference. */
  issuerPubkey: string;
  identifier: string;
}

/**
 * Compute pending (unaccepted) badges for a user.
 *
 * A badge is "pending" when a kind 8 award event tags the user, but the
 * user's profile badges event (kind 10008 or legacy 30008) does NOT contain
 * the corresponding `e` tag (award event ID).
 */
export function usePendingBadges(pubkey: string | undefined) {
  const { nostr } = useNostr();

  // All badge awards TO this user
  const awardsQuery = useQuery({
    queryKey: ['badge-awards-to', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];
      return nostr.query(
        [{ kinds: [BADGE_AWARD_KIND], '#p': [pubkey], limit: 200 }],
        { signal },
      );
    },
    enabled: !!pubkey,
    staleTime: 60_000,
  });

  // The user's accepted badges
  const { refs: acceptedRefs } = useProfileBadges(pubkey);

  const pendingBadges = useMemo(() => {
    if (!awardsQuery.data) return [];

    // Build a set of accepted award event IDs for fast lookup
    const acceptedEventIds = new Set(
      acceptedRefs.filter((r) => r.eTag).map((r) => r.eTag!),
    );

    const pending: PendingBadge[] = [];
    // Track which badge a-tags we've already seen to avoid duplicate pending entries
    const seenATags = new Set<string>();

    for (const awardEvent of awardsQuery.data) {
      // Skip if this specific award event is already accepted
      if (acceptedEventIds.has(awardEvent.id)) continue;

      // Find the badge reference `a` tag
      const aTag = awardEvent.tags.find(
        ([n, v]) => n === 'a' && v?.startsWith('30009:'),
      )?.[1];
      if (!aTag) continue;

      // Skip if we already have a pending entry for this badge definition
      if (seenATags.has(aTag)) continue;

      // Also skip if the user already accepted this badge from a DIFFERENT award event
      if (acceptedRefs.some((r) => r.aTag === aTag)) continue;

      seenATags.add(aTag);

      const parts = aTag.split(':');
      if (parts.length < 3) continue;

      pending.push({
        aTag,
        awardEvent,
        awardedAt: awardEvent.created_at,
        issuerPubkey: parts[1],
        identifier: parts.slice(2).join(':'),
      });
    }

    // Sort newest first
    return pending.sort((a, b) => b.awardedAt - a.awardedAt);
  }, [awardsQuery.data, acceptedRefs]);

  return {
    /** Pending (unaccepted) badges, newest first. */
    pendingBadges,
    /** Number of pending badges. */
    count: pendingBadges.length,
    isLoading: awardsQuery.isLoading,
  };
}
