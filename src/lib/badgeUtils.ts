import type { NostrEvent } from '@nostrify/nostrify';

/** Kind numbers for NIP-58 badge events. */
export const BADGE_DEFINITION_KIND = 30009;
export const BADGE_AWARD_KIND = 8;
export const BADGE_PROFILE_KIND = 30008;

/**
 * Build the canonical `a` tag value for a kind 30009 badge definition.
 * Format: `30009:<pubkey>:<d-tag>`
 */
export function getBadgeATag(event: NostrEvent): string {
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  return `${BADGE_DEFINITION_KIND}:${event.pubkey}:${dTag}`;
}

/** Check if a badge award event targets a given user pubkey. */
export function isAwardedTo(awardEvent: NostrEvent, pubkey: string): boolean {
  return awardEvent.tags.some(([n, v]) => n === 'p' && v === pubkey);
}
