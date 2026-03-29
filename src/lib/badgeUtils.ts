import type { NostrEvent, NPool } from '@nostrify/nostrify';

/** Kind numbers for NIP-58 badge events. */
export const BADGE_DEFINITION_KIND = 30009;
export const BADGE_AWARD_KIND = 8;
export const BADGE_PROFILE_KIND = 10008;

/**
 * Legacy kind for profile badges (addressable, NIP-58 original).
 * Clients should still READ from both 10008 and 30008, picking the newest,
 * but should always WRITE to 10008.
 */
export const BADGE_PROFILE_KIND_LEGACY = 30008;

/** Both profile badge kinds, used when querying. */
export const BADGE_PROFILE_KINDS = [BADGE_PROFILE_KIND, BADGE_PROFILE_KIND_LEGACY] as const;

/**
 * Build the canonical `a` tag value for a kind 30009 badge definition.
 * Format: `30009:<pubkey>:<d-tag>`
 */
export function getBadgeATag(event: NostrEvent): string {
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  return `${BADGE_DEFINITION_KIND}:${event.pubkey}:${dTag}`;
}

/** Check whether an event is a profile badges event (either new or legacy kind). */
export function isProfileBadgesKind(kind: number): boolean {
  return kind === BADGE_PROFILE_KIND || kind === BADGE_PROFILE_KIND_LEGACY;
}

/**
 * Fetch the freshest profile badges event from relays, querying both the new
 * kind 10008 and legacy kind 30008, and returning whichever is newest.
 *
 * This MUST be used inside mutations that read-modify-write the profile badges
 * event, to avoid overwriting data from another device.
 */
export async function fetchFreshProfileBadges(
  nostr: NPool,
  pubkey: string,
): Promise<NostrEvent | null> {
  const signal = AbortSignal.timeout(10_000);

  const events = await nostr.query(
    [
      { kinds: [BADGE_PROFILE_KIND], authors: [pubkey], limit: 1 },
      { kinds: [BADGE_PROFILE_KIND_LEGACY], authors: [pubkey], '#d': ['profile_badges'], limit: 1 },
    ],
    { signal },
  );

  if (events.length === 0) return null;

  // Pick the most recent event across both kinds
  return events.reduce((latest, current) =>
    current.created_at > latest.created_at ? current : latest,
  );
}

/** Check if a badge award event targets a given user pubkey. */
export function isAwardedTo(awardEvent: NostrEvent, pubkey: string): boolean {
  return awardEvent.tags.some(([n, v]) => n === 'p' && v === pubkey);
}
