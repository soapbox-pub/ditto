import type { NostrEvent } from '@nostrify/nostrify';

import { BADGE_AWARD_KIND, BADGE_DEFINITION_KIND, isBadgeSetEvent } from '@/lib/badgeUtils';
import { isNostrId } from '@/lib/nostrId';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** A single badge reference parsed from a kind 30008 NIP-51 badge set. */
export interface BadgeSetRef {
  /** The `a` tag value referencing a kind 30009 badge definition. */
  aTag: string;
  kind: number;
  pubkey: string;
  identifier: string;
  /** Optional `e` tag value referencing a kind 8 badge award event. */
  eTag?: string;
}

/** Parsed metadata for a NIP-51 badge set (kind 30008). */
export interface BadgeSetData {
  /** The set's `d` identifier (e.g. "ra-1446"). */
  identifier: string;
  /** Display title from the `title` tag, falls back to the identifier. */
  title: string;
  /** Optional description from the `description` tag. */
  description?: string;
  /** Optional set image (already sanitized). */
  image?: string;
  /** Badge definition references in tag order. */
  badges: BadgeSetRef[];
}

/**
 * Parse a NIP-51 badge set event (kind 30008 with `d != profile_badges`).
 *
 * Per NIP-51, badge sets are "categorized groups of NIP-58 badges" with
 * optional `title`, `image`, `description` tags, and a sequence of `a` tags
 * referencing kind 30009 badge definitions (optionally each followed by an
 * `e` tag referencing the corresponding kind 8 award).
 *
 * Returns null if the event is not a valid badge set.
 */
export function parseBadgeSet(event: NostrEvent): BadgeSetData | null {
  if (!isBadgeSetEvent(event)) return null;

  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];

  const identifier = getTag('d');
  if (!identifier) return null;

  const title = getTag('title') ?? identifier;
  const description = getTag('description');
  const image = sanitizeUrl(getTag('image'));

  const badges: BadgeSetRef[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < event.tags.length; i++) {
    const tag = event.tags[i];
    if (tag[0] !== 'a' || !tag[1]) continue;

    const parts = tag[1].split(':');
    if (parts.length < 3) continue;

    const kind = parseInt(parts[0], 10);
    if (kind !== BADGE_DEFINITION_KIND) continue;

    const pubkey = parts[1];
    if (!isNostrId(pubkey)) continue;
    const refIdentifier = parts.slice(2).join(':');

    // An optional `e` tag immediately following the `a` tag is the matching
    // kind 8 badge award event for this entry — mirroring NIP-58 profile
    // badges layout.
    let eTag: string | undefined;
    const next = event.tags[i + 1];
    if (next?.[0] === 'e' && next[1]) {
      eTag = next[1];
    }

    const aTag = tag[1];
    if (seen.has(aTag)) continue;
    seen.add(aTag);

    badges.push({ aTag, kind, pubkey, identifier: refIdentifier, eTag });
  }

  return { identifier, title, description, image, badges };
}

/** Re-export for callers that consume award references separately. */
export { BADGE_AWARD_KIND };
