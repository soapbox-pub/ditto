import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { IntlShape } from 'react-intl';

/**
 * Query all events matching a filter using `req()` instead of `query()`.
 * This bypasses NSet deduplication in NPool.query(), which discards older
 * versions of replaceable events. Recovery needs every historical version.
 */
export async function queryAllVersions(
  nostr: { req(filters: NostrFilter[], opts?: { signal?: AbortSignal }): AsyncIterable<['EVENT', string, NostrEvent] | ['EOSE', string] | ['CLOSED', string, string]> },
  filters: NostrFilter[],
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  const events: NostrEvent[] = [];
  const seen = new Set<string>();

  for await (const msg of nostr.req(filters, { signal })) {
    if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
    if (msg[0] === 'EVENT') {
      const event = msg[2];
      if (!seen.has(event.id)) {
        seen.add(event.id);
        events.push(event);
      }
    }
  }

  return events.sort((a, b) => b.created_at - a.created_at);
}

/** Format a unix timestamp into a human-readable date string. */
export function formatVersionDate(timestamp: number, intl: IntlShape): string {
  return intl.formatDate(new Date(timestamp * 1000), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A version shown once, standing in for every identical copy saved after it. */
export interface CollapsedVersion {
  /** The newest copy. */
  event: NostrEvent;
  /** How many saved events carry this same version, including `event`. */
  copies: number;
}

/**
 * Fold identical versions into the newest copy of each. `events` must be
 * sorted newest first. Events whose key is `undefined` can't be compared
 * (e.g. undecryptable content) and are always kept on their own.
 */
export function collapseVersions(
  events: NostrEvent[],
  keyOf: (event: NostrEvent) => string | undefined,
): CollapsedVersion[] {
  const versions: CollapsedVersion[] = [];
  const byKey = new Map<string, CollapsedVersion>();

  for (const event of events) {
    const key = keyOf(event);
    const existing = key === undefined ? undefined : byKey.get(key);
    if (existing) {
      existing.copies++;
      continue;
    }
    const version = { event, copies: 1 };
    versions.push(version);
    if (key !== undefined) byKey.set(key, version);
  }

  return versions;
}

/** Tags any publish may add or change without changing what the event says. */
const BOOKKEEPING_TAGS = new Set(['client', 'published_at', 'alt']);

interface VersionKeyOptions {
  /** Treat tags as a set: entries that come back reordered still match. */
  unorderedTags?: boolean;
  /** Extra tag names to ignore, beyond the bookkeeping ones. */
  ignoreTags?: string[];
  /** Compare tags only. */
  ignoreContent?: boolean;
}

/** A comparison key for an event's content and meaningful tags. */
export function versionKey(event: NostrEvent, options: VersionKeyOptions = {}): string {
  const ignored = new Set([...BOOKKEEPING_TAGS, ...(options.ignoreTags ?? [])]);
  let tags = event.tags.filter(([name]) => !ignored.has(name)).map((tag) => JSON.stringify(tag));
  if (options.unorderedTags) tags = [...new Set(tags)].sort();
  return JSON.stringify([options.ignoreContent ? '' : event.content, tags]);
}

/** JSON with object keys sorted, so reordered fields compare equal. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
