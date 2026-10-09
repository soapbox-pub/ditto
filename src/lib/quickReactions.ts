import type { NostrEvent } from '@nostrify/nostrify';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Quick reactions (kind 10077, a NIP-51-style list documented in NIP.md): the
 * reactions a client offers first, in the user's order. Each `reaction` tag is
 * a NIP-25 `.content`, plus the image URL and optional emoji-set address of a
 * custom `:shortcode:` emoji.
 */
export const QUICK_REACTIONS_KIND = 10077;

const ALT = 'Quick reactions: the emoji reactions this user wants offered first';

/** A reaction on the quick row; `url` (and `set`) only for a custom `:shortcode:` emoji. */
export interface ListedQuickReaction {
  emoji: string;
  url?: string;
  /** The `30030:pubkey:d` emoji set the custom emoji came from. */
  set?: string;
}

/** The list's reactions in order, first occurrence of each kept. */
export function parseQuickReactions(event: Pick<NostrEvent, 'tags'> | null | undefined): ListedQuickReaction[] {
  if (!event) return [];
  const out: ListedQuickReaction[] = [];
  const seen = new Set<string>();
  for (const [name, emoji, rawUrl, set] of event.tags) {
    if (name !== 'reaction' || !emoji || seen.has(emoji)) continue;
    seen.add(emoji);
    const url = sanitizeUrl(rawUrl);
    out.push(url ? (set ? { emoji, url, set } : { emoji, url }) : { emoji });
  }
  return out;
}

/** `reaction` tags for `reactions`, in order. */
export function quickReactionTags(reactions: readonly ListedQuickReaction[]): string[][] {
  return reactions.map(({ emoji, url, set }) =>
    url ? (set ? ['reaction', emoji, url, set] : ['reaction', emoji, url]) : ['reaction', emoji]);
}

/**
 * The next version's tags: `prev`'s other tags kept (another client's items
 * survive), its reactions replaced, and a NIP-31 `alt`. The publisher stamps
 * its own `client`.
 */
export function nextQuickReactionTags(
  prev: Pick<NostrEvent, 'tags'> | null | undefined,
  reactions: readonly ListedQuickReaction[],
): string[][] {
  const kept = prev?.tags.filter(([name]) => name !== 'reaction' && name !== 'client' && name !== 'alt') ?? [];
  return [...kept.map((t) => [...t]), ...quickReactionTags(reactions), ['alt', ALT]];
}
