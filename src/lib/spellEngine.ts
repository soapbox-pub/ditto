import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

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
      if (contactPubkeys.length === 0) throw new Error('Cannot resolve $contacts: no contacts found');
      return contactPubkeys;
    }
    return [v];
  });
}

export interface ResolvedSpell {
  /** The command type: REQ or COUNT. */
  cmd: 'REQ' | 'COUNT';
  /** The resolved Nostr filter. */
  filter: NostrFilter;
  /** Target relay URLs (if specified by the spell). */
  relays: string[];
  /** Whether the subscription should close after EOSE. */
  closeOnEose: boolean;
}

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

  return { cmd, filter, relays, closeOnEose };
}
