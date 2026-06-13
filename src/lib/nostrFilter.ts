import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

// ============================================================================
// nostrFilter — a parsed, normalized representation of a single Nostr filter,
// plus an in-memory matcher. This is a TypeScript port of strfry's
// `NostrFilter` (src/filters.h): it pre-sorts/dedupes each value set, counts
// the "major" fields used by the query planner, and decides whether a scan can
// be satisfied by an index alone (`indexOnly`) or needs a post-filter re-check.
//
// strfry's version exists to drive an LMDB scan; ours drives an IndexedDB scan
// (see NIndexedDB). The matching semantics are identical to NIP-01:
//   - `ids`/`authors`/`kinds`: membership in the set.
//   - `#x` tag filters: the event has at least one `x` tag whose value is in
//     the set. The tag name may be single- or multi-letter (`#e`, `#proxy`).
//   - `since`/`until`: inclusive created_at bounds.
//   - multiple filters in a request are OR'd; conditions within a filter AND.
// ============================================================================

/** A tag filter, e.g. `{ name: 'e', values: [...] }` for `#e`. */
export interface TagFilter {
  /** The tag name without the leading `#` (single- or multi-letter). */
  name: string;
  /** Sorted, de-duplicated set of acceptable values. */
  values: string[];
}

export class ParsedFilter {
  readonly ids?: string[];
  readonly authors?: string[];
  readonly kinds?: number[];
  /** Tag filters (`#x`), each holding a single- or multi-letter name. */
  readonly tags: TagFilter[];
  readonly search?: string;

  readonly since?: number;
  readonly until?: number;
  readonly limit?: number;

  /**
   * True when this filter can never match anything (an empty array was given
   * for a constraint, e.g. `{ ids: [] }`). The planner short-circuits these.
   */
  readonly neverMatch: boolean;

  /**
   * True when a single index scan fully satisfies the filter, so the scanner
   * only needs the time-range check and can skip fetching+re-matching the
   * event body. Mirrors strfry's `indexOnlyScans`:
   *   numMajorFields <= 1, OR (numMajorFields === 2 && authors && kinds).
   *
   * NOTE: a `search` term always forces a post-filter (no index covers it).
   */
  readonly indexOnly: boolean;

  constructor(filter: NostrFilter) {
    let neverMatch = false;
    let numMajorFields = 0;
    const tags: TagFilter[] = [];

    for (const [key, value] of Object.entries(filter)) {
      // Empty array constraints can never match (NIP-01).
      if (Array.isArray(value) && value.length === 0) {
        neverMatch = true;
        continue;
      }

      if (key === 'ids') {
        this.ids = sortUnique(value as string[]);
        numMajorFields++;
      } else if (key === 'authors') {
        this.authors = sortUnique(value as string[]);
        numMajorFields++;
      } else if (key === 'kinds') {
        this.kinds = sortUniqueNums(value as number[]);
        numMajorFields++;
      } else if (key === 'since') {
        this.since = value as number;
      } else if (key === 'until') {
        this.until = value as number;
      } else if (key === 'limit') {
        this.limit = value as number;
      } else if (key === 'search') {
        // We don't index full-text search; keep it for the post-filter only.
        this.search = value as string;
      } else if (key.startsWith('#') && key.length >= 2) {
        // Any `#`-prefixed key is a tag filter; the name is everything after
        // the `#` (single- OR multi-letter, e.g. `#e`, `#proxy`). Whether such
        // a tag is actually queryable depends on the store's `indexTags`
        // policy — a filter on a non-indexed tag simply matches nothing.
        tags.push({ name: key.slice(1), values: sortUnique(value as string[]) });
        numMajorFields++;
      }
      // Unrecognised keys are ignored (treated as no constraint),
      // matching the lenient behavior expected of a client-side cache.
    }

    this.tags = tags;
    this.neverMatch = neverMatch;

    // A search term can't be satisfied by any index, so it always needs a
    // post-filter regardless of the major-field count.
    const hasSearch = typeof this.search === 'string';
    this.indexOnly = !hasSearch &&
      (numMajorFields <= 1 || (numMajorFields === 2 && !!this.authors && !!this.kinds));
  }

  /** Inclusive created_at range check. */
  matchesTime(createdAt: number): boolean {
    if (this.since !== undefined && createdAt < this.since) return false;
    if (this.until !== undefined && createdAt > this.until) return false;
    return true;
  }

  /** Full NIP-01 match of an event against every condition in this filter. */
  matches(event: NostrEvent): boolean {
    if (this.neverMatch) return false;
    if (!this.matchesTime(event.created_at)) return false;

    if (this.ids && !this.ids.includes(event.id)) return false;
    if (this.authors && !this.authors.includes(event.pubkey)) return false;
    if (this.kinds && !this.kinds.includes(event.kind)) return false;

    for (const { name, values } of this.tags) {
      const found = event.tags.some(([n, v]) => n === name && values.includes(v));
      if (!found) return false;
    }

    if (this.search !== undefined) {
      if (!event.content.toLowerCase().includes(this.search.toLowerCase())) return false;
    }

    return true;
  }
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sortUniqueNums(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
