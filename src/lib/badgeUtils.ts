import type { NostrEvent } from '@nostrify/nostrify';

/** Kind numbers for NIP-58 badge events. */
export const BADGE_DEFINITION_KIND = 30009;
export const BADGE_AWARD_KIND = 8;
export const BADGE_PROFILE_KIND = 30008;

/** DVM kinds for achievement claims (NIP-90). */
export const DVM_JOB_REQUEST_KIND = 5950;
export const DVM_JOB_RESULT_KIND = 6950;

/**
 * Hex pubkey for the Ditto Badge account that issues achievement and shop badges.
 * npub1tn2ylw8sc42ew6rfzv4hwt47r4jza6jqadj7s2fmhf2q8xg7rscqqzmjlg
 */
export const BADGE_ACCOUNT_PUBKEY = '5cd44fb8f0c555976869132b772ebe1d642eea40eb65e8293bba5403991e1c30';

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

/** Check if a badge is a "shop" badge (has a price tag). */
export function isShopBadge(event: NostrEvent): boolean {
  return event.tags.some(([n]) => n === 'price');
}

/** Get the price of a shop badge in sats, or null if not a shop badge. */
export function getBadgePrice(event: NostrEvent): number | null {
  const priceTag = event.tags.find(([n]) => n === 'price');
  if (!priceTag?.[1]) return null;
  const price = parseInt(priceTag[1], 10);
  return isNaN(price) ? null : price;
}

/** Get the supply info for a limited-edition badge, or null if unlimited. */
export function getBadgeSupply(event: NostrEvent): { total: number; sold?: number } | null {
  const supplyTag = event.tags.find(([n]) => n === 'supply');
  if (!supplyTag?.[1]) return null;
  const total = parseInt(supplyTag[1], 10);
  if (isNaN(total)) return null;
  const soldTag = event.tags.find(([n]) => n === 'sold');
  const sold = soldTag?.[1] ? parseInt(soldTag[1], 10) : undefined;
  return { total, sold: sold && !isNaN(sold) ? sold : undefined };
}

/** Get the category of a badge from its `t` tags. */
export function getBadgeCategory(event: NostrEvent): string | undefined {
  return event.tags.find(([n, v]) => n === 't' && v && v !== 'shop' && v !== 'achievement')?.[1];
}

/** Check if a badge is a Ditto achievement badge (has `t` tag "achievement"). */
export function isAchievementBadge(event: NostrEvent): boolean {
  return event.tags.some(([n, v]) => n === 't' && v === 'achievement');
}

/** Get the tier of an achievement badge (bronze, silver, gold, diamond). */
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export function getBadgeTier(event: NostrEvent): BadgeTier | undefined {
  const tierTag = event.tags.find(([n]) => n === 'tier');
  const tier = tierTag?.[1]?.toLowerCase();
  if (tier === 'bronze' || tier === 'silver' || tier === 'gold' || tier === 'diamond') {
    return tier;
  }
  return undefined;
}
