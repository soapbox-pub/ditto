import type { NostrEvent } from '@nostrify/nostrify';

import { isProfileBadgesKind } from '@/lib/badgeUtils';

/** A parsed badge reference from a profile badges event. */
export interface BadgeRef {
  /** The `a` tag value referencing a kind 30009 badge definition. */
  aTag: string;
  /** The `e` tag value referencing a kind 8 badge award event. */
  eTag?: string;
  /** Parsed components from the `a` tag. */
  kind: number;
  pubkey: string;
  identifier: string;
}

/** Parse a profile badges event (kind 10008 or legacy 30008) into badge references. */
export function parseProfileBadges(event: NostrEvent): BadgeRef[] {
  if (!isProfileBadgesKind(event.kind)) return [];
  // Legacy kind 30008 requires d=profile_badges; kind 10008 doesn't need it
  if (event.kind === 30008) {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1];
    if (dTag !== 'profile_badges') return [];
  }

  const refs: BadgeRef[] = [];
  const tags = event.tags;

  for (let i = 0; i < tags.length; i++) {
    if (tags[i][0] === 'a' && tags[i][1]) {
      const aTag = tags[i][1];
      const parts = aTag.split(':');
      if (parts.length < 3) continue;

      const kind = parseInt(parts[0], 10);
      if (kind !== 30009) continue;

      const pubkey = parts[1];
      const identifier = parts.slice(2).join(':');

      // Look for the corresponding `e` tag immediately after
      let eTag: string | undefined;
      if (i + 1 < tags.length && tags[i + 1][0] === 'e') {
        eTag = tags[i + 1][1];
      }

      refs.push({ aTag, eTag, kind, pubkey, identifier });
    }
  }

  // Deduplicate by aTag -- keep first occurrence only
  const seen = new Set<string>();
  return refs.filter((r) => {
    if (seen.has(r.aTag)) return false;
    seen.add(r.aTag);
    return true;
  });
}
