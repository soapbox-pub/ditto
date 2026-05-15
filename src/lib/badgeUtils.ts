import type { NostrEvent, NPool } from '@nostrify/nostrify';

import { isNostrId } from '@/lib/nostrId';

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
 * NIP-51 "Badge set" kind — categorized groups of NIP-58 badges. Shares the
 * same kind number (30008) as legacy profile badges, but uses an arbitrary
 * `d` identifier (the set's id) instead of the fixed `d=profile_badges`.
 */
export const BADGE_SET_KIND = 30008;

/**
 * Build the canonical `a` tag value for a kind 30009 badge definition.
 * Format: `30009:<pubkey>:<d-tag>`
 */
export function getBadgeATag(event: NostrEvent): string {
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  return `${BADGE_DEFINITION_KIND}:${event.pubkey}:${dTag}`;
}

/**
 * Check whether a kind number is *eligible* to be a profile badges event.
 *
 * NOTE: this is kind-only — it cannot distinguish between a legacy NIP-58
 * profile badges event (`kind=30008`, `d=profile_badges`) and a NIP-51 badge
 * set (`kind=30008`, arbitrary `d`). For event-level discrimination, use
 * {@link isProfileBadgesEvent} or {@link isBadgeSetEvent}.
 */
export function isProfileBadgesKind(kind: number): boolean {
  return kind === BADGE_PROFILE_KIND || kind === BADGE_PROFILE_KIND_LEGACY;
}

/**
 * Check whether an event is a NIP-58 profile badges event.
 *
 * Kind 10008 is unambiguously profile badges (NIP-51 standard list).
 * Kind 30008 is profile badges *only* when `d=profile_badges` (legacy NIP-58
 * usage). Anything else with kind 30008 is a NIP-51 badge set, not profile
 * badges.
 */
export function isProfileBadgesEvent(event: NostrEvent): boolean {
  if (event.kind === BADGE_PROFILE_KIND) return true;
  if (event.kind !== BADGE_PROFILE_KIND_LEGACY) return false;
  const dTag = event.tags.find(([n]) => n === 'd')?.[1];
  return dTag === 'profile_badges';
}

/**
 * Check whether an event is a NIP-51 badge set — kind 30008 with an arbitrary
 * `d` identifier that is *not* `profile_badges` (which would make it a legacy
 * profile badges event instead).
 */
export function isBadgeSetEvent(event: NostrEvent): boolean {
  if (event.kind !== BADGE_SET_KIND) return false;
  const dTag = event.tags.find(([n]) => n === 'd')?.[1];
  return typeof dTag === 'string' && dTag.length > 0 && dTag !== 'profile_badges';
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

/**
 * Extract pubkey and identifier from a kind 8 badge award event's `a` tag.
 * Returns undefined if the tag is missing, malformed, or the pubkey is not a
 * valid 64-char hex string (to avoid crashes in `nip19.naddrEncode`).
 */
export function parseBadgeATag(
  event: NostrEvent,
): { pubkey: string; identifier: string } | undefined {
  const aVal = event.tags.find(
    ([n, v]) => n === 'a' && v?.startsWith(`${BADGE_DEFINITION_KIND}:`),
  )?.[1];
  if (!aVal) return undefined;
  const parts = aVal.split(':');
  if (parts.length < 3 || !parts[1] || !parts[2]) return undefined;
  if (!isNostrId(parts[1])) return undefined;
  return { pubkey: parts[1], identifier: parts.slice(2).join(':') };
}

/** Turn a d-tag slug like "first-post" into "First Post". */
export function unslugify(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extract all recipient pubkeys (`p` tags) from a kind 8 badge award event. */
export function getBadgeRecipients(event: NostrEvent): string[] {
  return event.tags
    .filter(([n]) => n === 'p')
    .map(([, v]) => v)
    .filter(isNostrId);
}
