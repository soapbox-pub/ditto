import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Unit multipliers for relative timestamps (in seconds). */
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  mo: 2592000,
  y: 31536000,
};

/** Valid media type values for the `media` tag. */
export const SPELL_MEDIA_TYPES = ['all', 'images', 'videos', 'vines', 'none'] as const;
export type SpellMediaType = typeof SPELL_MEDIA_TYPES[number];

/** Valid sort preference values for the `sort` tag. */
export const SPELL_SORT_VALUES = ['recent', 'hot', 'trending'] as const;
export type SpellSort = typeof SPELL_SORT_VALUES[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve a spell timestamp value to an absolute Unix timestamp. */
function resolveTimestamp(value: string): number {
  if (value === 'now') return Math.floor(Date.now() / 1000);

  const match = value.match(/^(\d+)(s|m|h|d|w|mo|y)$/);
  if (match) {
    const amount = parseInt(match[1]);
    const unit = match[2];
    const seconds = UNIT_SECONDS[unit];
    if (seconds !== undefined) {
      return Math.floor(Date.now() / 1000) - amount * seconds;
    }
  }

  // Absolute timestamp
  const ts = parseInt(value);
  if (!isNaN(ts)) return ts;

  throw new Error(`Invalid timestamp value: ${value}`);
}

/** Resolve runtime variables in an array of values. */
function resolveValues(
  values: string[],
  userPubkey: string | undefined,
  contactPubkeys: string[],
): string[] {
  return values.flatMap((v) => {
    if (v === '$me') {
      if (!userPubkey) throw new Error('Cannot resolve $me: no logged-in user');
      return [userPubkey];
    }
    if (v === '$contacts') {
      return contactPubkeys;
    }
    return [v];
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** Client-hint fields parsed from spell metadata tags. These instruct the
 *  client how to build NIP-50 search extensions and apply client-side filters. */
export interface SpellClientHints {
  /** Media filter: 'all' (default), 'images', 'videos', 'vines', 'none'. */
  mediaType: SpellMediaType;
  /** Whether to include reply events. Default true. */
  includeReplies: boolean;
  /** Language code for NIP-50 language: extension, e.g. 'en'. Undefined = no filter. */
  language?: string;
  /** Protocol filter, e.g. 'nostr', 'activitypub', 'atproto'. Default 'nostr'. */
  platform: string;
  /** Sort preference for NIP-50 sort: extension. Default 'recent' (no sort: term). */
  sort: SpellSort;
}

export interface ResolvedSpell {
  /** The command type: REQ or COUNT. */
  cmd: 'REQ' | 'COUNT';
  /** The resolved Nostr filter (kinds, authors, search text, since/until, etc.). */
  filter: NostrFilter;
  /** Client-hint fields for NIP-50 extensions and client-side filtering. */
  hints: SpellClientHints;
  /** Target relay URLs (if specified by the spell). */
  relays: string[];
  /** Whether the subscription should close after EOSE. */
  closeOnEose: boolean;
  /** Whether the spell uses NIP-50 extensions that require Ditto relay routing
   *  (media, language, platform, sort). Plain keyword search does not set this. */
  needsDittoRelay: boolean;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Parse a kind:777 spell event into a resolved Nostr filter.
 *
 * Resolves runtime variables ($me, $contacts) and relative timestamps
 * into concrete values ready to send as a REQ.
 */
export function resolveSpell(
  event: NostrEvent,
  userPubkey: string | undefined,
  contactPubkeys: string[],
): ResolvedSpell {
  const { tags } = event;

  const cmd = (tags.find(([t]) => t === 'cmd')?.[1] ?? 'REQ') as 'REQ' | 'COUNT';

  const filter: NostrFilter = {};

  // Kinds
  const kinds = tags.filter(([t]) => t === 'k').map(([, v]) => parseInt(v)).filter((n) => !isNaN(n));
  if (kinds.length > 0) filter.kinds = kinds;

  // Authors
  const authorsTag = tags.find(([t]) => t === 'authors');
  if (authorsTag) {
    const resolved = resolveValues(authorsTag.slice(1), userPubkey, contactPubkeys);
    if (resolved.length > 0) filter.authors = resolved;
  }

  // IDs
  const idsTag = tags.find(([t]) => t === 'ids');
  if (idsTag) {
    filter.ids = idsTag.slice(1);
  }

  // Tag filters
  const tagFilters = tags.filter(([t]) => t === 'tag');
  for (const [, letter, ...values] of tagFilters) {
    if (letter) {
      const resolved = resolveValues(values, userPubkey, contactPubkeys);
      if (resolved.length > 0) {
        (filter as Record<string, unknown>)[`#${letter}`] = resolved;
      }
    }
  }

  // Limit
  const limitTag = tags.find(([t]) => t === 'limit');
  if (limitTag) {
    const n = parseInt(limitTag[1]);
    if (!isNaN(n)) filter.limit = n;
  }

  // Since
  const sinceTag = tags.find(([t]) => t === 'since');
  if (sinceTag) {
    filter.since = resolveTimestamp(sinceTag[1]);
  }

  // Until
  const untilTag = tags.find(([t]) => t === 'until');
  if (untilTag) {
    filter.until = resolveTimestamp(untilTag[1]);
  }

  // Search (NIP-50)
  const searchTag = tags.find(([t]) => t === 'search');
  if (searchTag) {
    filter.search = searchTag[1];
  }

  // Relays
  const relaysTag = tags.find(([t]) => t === 'relays');
  const relays = relaysTag ? relaysTag.slice(1) : [];

  // Close on EOSE
  const closeOnEose = tags.some(([t]) => t === 'close-on-eose');

  // ── Client hints (NIP-50 extensions) ──────────────────────────────────

  const rawMedia = tags.find(([t]) => t === 'media')?.[1];
  const mediaType: SpellMediaType = rawMedia && (SPELL_MEDIA_TYPES as readonly string[]).includes(rawMedia)
    ? rawMedia as SpellMediaType
    : 'all';

  const includeReplies = tags.find(([t]) => t === 'include-replies')?.[1] !== 'false';

  const language = tags.find(([t]) => t === 'language')?.[1] || undefined;

  const rawPlatform = tags.find(([t]) => t === 'platform')?.[1];
  const platform = rawPlatform || 'nostr';

  const rawSort = tags.find(([t]) => t === 'sort')?.[1];
  const sort: SpellSort = rawSort && (SPELL_SORT_VALUES as readonly string[]).includes(rawSort)
    ? rawSort as SpellSort
    : 'recent';

  const hints: SpellClientHints = { mediaType, includeReplies, language, platform, sort };

  // Determine if this spell needs Ditto relay routing.
  // Plain keyword search works on any relay; NIP-50 extensions do not.
  const needsDittoRelay = mediaType !== 'all'
    || (language !== undefined && language !== 'global')
    || platform !== 'nostr'
    || sort !== 'recent';

  return { cmd, filter, hints, relays, closeOnEose, needsDittoRelay };
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/** Build the kind:777 tags array from spell parameters.
 *  Used by both the AI tool handler and the manual spell builders. */
export function buildSpellTags(args: {
  name?: string;
  cmd?: string;
  kinds?: number[];
  authors?: string[];
  tag_filters?: Array<{ letter: string; values: string[] }>;
  since?: string;
  until?: string;
  limit?: number;
  search?: string;
  relays?: string[];
  media?: string;
  language?: string;
  platform?: string;
  sort?: string;
  includeReplies?: boolean;
}): string[][] {
  const tags: string[][] = [];

  if (args.name) tags.push(['name', args.name]);

  const cmd = args.cmd ?? 'REQ';
  tags.push(['cmd', cmd]);

  if (args.kinds) {
    for (const k of args.kinds) {
      tags.push(['k', String(k)]);
    }
  }

  if (args.authors && args.authors.length > 0) {
    tags.push(['authors', ...args.authors]);
  }

  if (args.tag_filters) {
    for (const tf of args.tag_filters) {
      if (tf.letter && Array.isArray(tf.values)) {
        tags.push(['tag', tf.letter, ...tf.values]);
      }
    }
  }

  if (args.since) tags.push(['since', args.since]);
  if (args.until) tags.push(['until', args.until]);
  if (typeof args.limit === 'number') tags.push(['limit', String(args.limit)]);
  if (args.search) tags.push(['search', args.search]);

  if (args.relays && args.relays.length > 0) {
    tags.push(['relays', ...args.relays]);
  }

  // Client-hint tags (NIP-50 extensions)
  if (args.media && args.media !== 'all') tags.push(['media', args.media]);
  if (args.language && args.language !== 'global') tags.push(['language', args.language]);
  if (args.platform && args.platform !== 'nostr') tags.push(['platform', args.platform]);
  if (args.sort && args.sort !== 'recent') tags.push(['sort', args.sort]);
  if (args.includeReplies === false) tags.push(['include-replies', 'false']);

  tags.push(['alt', `Spell: ${args.name ?? 'unnamed'}`]);

  return tags;
}

/** Build an unsigned kind:777 spell event from pre-built tags.
 *  Useful when you need a spell event structure without signing. */
export function buildUnsignedSpell(tags: string[][]): NostrEvent {
  return {
    id: '',
    pubkey: '',
    created_at: Math.floor(Date.now() / 1000),
    kind: 777,
    tags,
    content: '',
    sig: '',
  };
}

// ─── Spell Tag Parsers ───────────────────────────────────────────────────────
//
// Shared helpers for reading common fields out of a spell event's tags.
// Used by feed/tab edit modals to seed form state from an existing spell.

/** Extract the raw `authors` tag values. May contain `$me`, `$contacts`, or hex pubkeys. */
export function spellAuthors(spell: NostrEvent | undefined): string[] {
  return spell?.tags.find(([t]) => t === 'authors')?.slice(1) ?? [];
}

/** Extract kind numbers from `k` tags as string values. */
export function spellKinds(spell: NostrEvent | undefined): string[] {
  if (!spell) return [];
  return spell.tags.filter(([t]) => t === 'k').map(([, v]) => v);
}

/** Extract the `search` tag value. */
export function spellSearch(spell: NostrEvent | undefined): string {
  return spell?.tags.find(([t]) => t === 'search')?.[1] ?? '';
}

/**
 * Extract explicit author pubkeys, filtering out runtime variables
 * (`$me`, `$contacts`) and optionally a specific pubkey (e.g. profile owner).
 */
export function spellAuthorPubkeys(spell: NostrEvent | undefined, excludePubkey?: string): string[] {
  return spellAuthors(spell).filter((a) => {
    if (a.startsWith('$')) return false;
    if (excludePubkey && a === excludePubkey) return false;
    return true;
  });
}

/**
 * Stable semantic fingerprint for a spell event.
 * Two spells with the same fingerprint represent the same query regardless
 * of name, alt text, or event identity (id/pubkey/sig).
 */
export function spellFingerprint(spell: NostrEvent | undefined): string {
  if (!spell) return '';
  const METADATA_TAGS = new Set(['name', 'alt']);
  const filterTags = spell.tags
    .filter(([t]) => !METADATA_TAGS.has(t))
    .map((tag) => tag.join('\x00'))
    .sort();
  return filterTags.join('\n');
}
