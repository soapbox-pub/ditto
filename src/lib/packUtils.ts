import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

/** Kinds rendered as "people lists" — kind 3 follow lists, NIP-51 follow sets, and follow packs. */
export const PEOPLE_LIST_KINDS = new Set<number>([3, 30000, 39089]);

/** Returns true if an event should be rendered with the shared people-list components. */
export function isPeopleListKind(kind: number): boolean {
  return PEOPLE_LIST_KINDS.has(kind);
}

/** Classify the variant of a people-list event. */
export type PeopleListVariant = 'follow-list' | 'follow-set' | 'follow-pack';

export function getPeopleListVariant(kind: number): PeopleListVariant | null {
  if (kind === 3) return 'follow-list';
  if (kind === 30000) return 'follow-set';
  if (kind === 39089) return 'follow-pack';
  return null;
}

/**
 * Parsed people-list data. For kind 3 (follow lists) the event has no
 * title/description/image of its own, so callers pass the author's metadata
 * and we fall back to display name + about + banner.
 */
export interface ParsedPeopleList {
  /** Human-readable title (never empty — falls back to a sensible default). */
  title: string;
  /** Optional description. */
  description: string;
  /** Optional cover image URL. */
  image?: string;
  /** All pubkeys in the list (public `p` tags only — private items are handled separately). */
  pubkeys: string[];
  /** Variant of the list (for icon/copy choices). */
  variant: PeopleListVariant;
}

/**
 * Parse a people-list event (kind 3, 30000, or 39089) into structured data.
 *
 * For kind 3 (follow lists), the event carries no title/description/image of its
 * own. If `authorMetadata` and `authorDisplayName` are supplied, they're used as
 * a best-effort fallback so the card still has something meaningful to show.
 */
export function parsePeopleList(
  event: NostrEvent,
  opts?: { authorMetadata?: NostrMetadata; authorDisplayName?: string },
): ParsedPeopleList {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const pubkeys = event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);
  const variant = getPeopleListVariant(event.kind) ?? 'follow-pack';

  if (event.kind === 3) {
    // Kind 3 has no title/description/image of its own. Synthesize a title
    // from the author's display name so the card has a label, but DON'T pull
    // in `about` or `banner` — those describe the person, not their follow
    // list, and leak profile bio into unrelated views.
    const displayName = opts?.authorDisplayName || opts?.authorMetadata?.name || opts?.authorMetadata?.display_name;
    const title = displayName ? `${displayName}'s follows` : 'Follow list';
    return { title, description: '', image: undefined, pubkeys, variant };
  }

  const title = getTag('title') || getTag('name') || 'Untitled';
  const description = getTag('description') || getTag('summary') || '';
  const image = getTag('image') || getTag('thumb') || getTag('banner');
  return { title, description, image, pubkeys, variant };
}

/**
 * @deprecated Use {@link parsePeopleList} instead. Kept for backwards compatibility
 * with a few callers that parse kind 30000/39089 without author metadata.
 */
export function parsePackEvent(event: NostrEvent) {
  const { title, description, image, pubkeys } = parsePeopleList(event);
  return {
    title: title === 'Untitled' ? 'Untitled Pack' : title,
    description,
    image,
    pubkeys,
  };
}
