import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { BADGE_DEFINITION_KIND, isProfileBadgesEvent } from '@/lib/badgeUtils';

/**
 * What a newcomer shouldn't be greeted with: money, Nostr meta-talk and
 * politics. Screens onboarding's suggestions and the logged-out home feed.
 */
export const OFF_TOPIC = /₿|bitcoin|\bbtc\b|\bsats?\b|freedom|collectiv|socialis|communis|tyrann|\btax|satan|satoshi|crypto|hodl|bitfest|plebs?\b|\bstack|lightning|\bzaps?\b|wallet|nostr|fiat|\$\d|politic|uspol|election|government|trump|\bwar\b|\bice\b|datacenter|dicks?\b|fuck|shit|bitch|\bass\b/i;

/**
 * Narrower rule for profiles (names, bios). Almost everyone here mentions
 * Nostr or freedom somewhere in their bio; only screen out the crypto and
 * politics accounts.
 */
export const OFF_TOPIC_PROFILE = /₿|🟠|bitch|fuck|patriarch|treasury|bitcoin|\bbtc\b|\bbch\b|\bsats\b|satoshi|crypto|\bhodl\b|plebs?\b|\bmaxi\b|\bfiat\b|digital cash|\bp2p cash|blockchain|\bweb3\b|\bnfts?\b|\bdefi\b|token|ethereum|\beth\b|solana|altcoin|\bdoge|politic|trump|maga|election/i;

/** For apps and builders: the profile rule, plus payments tooling. */
export const OFF_TOPIC_BUILD = new RegExp(`${OFF_TOPIC_PROFILE.source}|lightning|wallet|\\bzaps?\\b|cashu|e-?cash|payments?|monero|lnurl|\\bnwc\\b|\\bdvm\\b|trading|exchange|\\bprice`, 'i');

export function isOffTopicProfile(text: string): boolean {
  return OFF_TOPIC_PROFILE.test(text);
}

/** NIP-50 terms for the Ditto relays: nothing NSFW or content-warned. */
export const SAFE_SEARCH = 'nsfw:false -tag:content-warning';

/**
 * Whether a profile looks like someone to show a newcomer. Someone without a
 * picture reads like a bot. With `vetted`, the bio isn't screened (the work
 * was already vetted some other way).
 */
export function isWelcomeProfile(metadata: NostrMetadata | undefined, vetted = false): boolean {
  if (!metadata?.picture || metadata.bot) return false;
  return vetted || !isOffTopicProfile(`${metadata.name ?? ''} ${metadata.display_name ?? ''} ${metadata.about ?? ''}`);
}

/** Whether an event's text, hashtags or title are {@link OFF_TOPIC}. */
export function isOffTopicEvent(event: NostrEvent): boolean {
  return OFF_TOPIC.test(event.content) || event.tags.some(([n, v]) => (n === 't' || n === 'title') && OFF_TOPIC.test(v ?? ''));
}

/** Posts carrying this many hashtags are almost always bots, reposters or stock art. */
const MAX_HASHTAGS = 8;

export function isHashtagStuffed(event: NostrEvent): boolean {
  return event.tags.filter(([n]) => n === 't').length > MAX_HASHTAGS;
}

/** Enough emoji in a pack, or badges on a profile, to show it off. */
export const MIN_COLLECTION = 4;

/**
 * Whether an emoji pack or a profile's badges hold too few to be worth
 * showing a newcomer. Other events never are.
 */
export function isSparseCollection(event: NostrEvent): boolean {
  if (event.kind === 30030) return event.tags.filter(([n]) => n === 'emoji').length < MIN_COLLECTION;
  if (isProfileBadgesEvent(event)) {
    return event.tags.filter(([n, v]) => n === 'a' && v?.startsWith(`${BADGE_DEFINITION_KIND}:`)).length < MIN_COLLECTION;
  }
  return false;
}
