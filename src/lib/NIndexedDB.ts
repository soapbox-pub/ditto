import { type DBSchema, type IDBPDatabase, type IDBPObjectStore, openDB } from 'idb';
import { type NostrEvent, type NostrFilter, NKinds, type NStore } from '@nostrify/nostrify';

import { ParsedFilter } from './nostrFilter';

// ============================================================================
// NIndexedDB — a general-purpose `NStore` backed by IndexedDB.
//
// This is a TypeScript port of strfry's LMDB query engine (src/DBQuery.h,
// src/filters.h) onto IndexedDB. It supports arbitrary Nostr filters: `ids`,
// `authors`, `kinds`, single-letter tag filters (`#e`, `#p`, `#t`, …),
// `since`/`until`, `limit`, `search`, and any combination thereof.
//
// Indexing strategy (mirrors strfry):
//   Every queryable index keys on its discriminator followed by `created_at`,
//   so a reverse scan of an index prefix yields that prefix's events
//   newest-first. strfry packs `created_at` into the trailing 8 bytes of an
//   LMDB key and installs custom comparators to compare it numerically;
//   IndexedDB compound *array* keys (`[pubkey, created_at]`) already sort by
//   element with native numeric ordering, so we get the same semantics for
//   free — no byte-fiddling, no endianness hazard.
//
// Object store `events` (keyed by `id`) holds the raw event plus derived
// index fields, with these indexes:
//   - by-created_at   →  created_at
//   - by-pubkey       →  [pubkey, created_at]
//   - by-kind         →  [kind, created_at]
//   - by-pubkey-kind  →  [pubkey, kind, created_at]
//   - by-tag          →  multiEntry over _tagsCreated: Array<[name, value, created_at]>
//
// Which tags are indexed (and therefore queryable) is configurable via the
// `indexTags` option, mirroring Nostrify's NPostgres. By default all
// single-letter tags with a non-empty value under 200 chars are indexed. The
// tag-index key carries the tag name and value as separate array elements, so
// names of any length work and there is no name/value ambiguity. A filter on a
// tag that isn't indexed simply matches nothing.
//
// Query planning (the `DBScan` priority cascade):
//   ids → most-selective #tag → pubkey+kind (<1000 combos) → pubkey → kind →
//   full created_at scan. One index is chosen; one cursor per discrete value.
//   Cursors are merged newest-first; non-index-only scans re-check each
//   candidate against the full filter in memory.
//
// Replaceable/addressable supersession: on write, older versions at the same
// (kind, pubkey, d) coordinate are deleted, so queries never surface a stale
// profile or list. (NIP-09 deletions and NIP-40 expiration are NOT handled —
// relays enforce those; a lagging cache is harmless.)
//
// Eviction: the cache is otherwise append-only and would grow without bound.
// After each write flush, events older than a configured maximum age are
// pruned, subject to who authored them:
//
//   - Logged-in accounts' own events are never evicted (any kind, any age).
//   - Followed accounts' **non-regular** events (replaceable/addressable —
//     profiles, lists, etc., the read-modify-write base for mutations) are
//     never evicted. Their **regular** events are evictable once old.
//   - Everyone else's events are evictable once old, regardless of kind.
//
// "Followed" is the union of the contact lists of all logged-in accounts.
// Pruning by age — rather than by total count — means the work is a bounded
// range scan over the `by-created_at` index up to the age cutoff: when nothing
// is old enough, the scan visits no rows and costs nothing, so there is no
// repeated full-store scan when the cache is full of recent or protected
// events. The eviction policy is supplied as a getter so the live AppConfig
// max-age, the current login set, and the current follow set are read fresh on
// each pass.
//
// When IndexedDB is unavailable (iOS Lockdown Mode, some private-browsing
// contexts) the store degrades to a no-op: `event()` does nothing and
// `query()` returns `[]`.
// ============================================================================

/** The default events object store name. */
const EVENTS_STORE = 'events';

/** Index names on the events store. */
const INDEX = {
  createdAt: 'by-created_at',
  pubkey: 'by-pubkey',
  kind: 'by-kind',
  pubkeyKind: 'by-pubkey-kind',
  tag: 'by-tag',
} as const;

/** A stored row: the event plus derived fields used purely for indexing. */
interface StoredEvent extends NostrEvent {
  /** multiEntry tag index: one [name, value, created_at] tuple per indexed tag. */
  _tagsCreated?: Array<[string, string, number]>;
}

/** Strongly-typed IndexedDB schema for the events store. */
interface EventsDB extends DBSchema {
  [EVENTS_STORE]: {
    key: string;
    value: StoredEvent;
    indexes: {
      [INDEX.createdAt]: number;
      [INDEX.pubkey]: [string, number];
      [INDEX.kind]: [number, number];
      [INDEX.pubkeyKind]: [string, number, number];
      [INDEX.tag]: [string, string, number];
    };
  };
}

/** A readwrite/readonly handle to the events object store. */
type EventsStore<M extends IDBTransactionMode> = IDBPObjectStore<
  EventsDB,
  [typeof EVENTS_STORE],
  typeof EVENTS_STORE,
  M
>;

export interface NIndexedDBOpts {
  /** Database name. Defaults to `ditto-events`. */
  name?: string;
  /** Schema version. Defaults to `2`. */
  version?: number;
  /**
   * Returns which tags to index, as `[name, value]` pairs, so tag queries like
   * `{ "#p": [...] }` work. Defaults to all single-letter tags with a non-empty
   * value under 200 chars (see {@link NIndexedDB.indexTags}). Only the
   * tags returned here are queryable; a filter on any other tag matches
   * nothing.
   */
  indexTags?(event: NostrEvent): string[][];
  /**
   * Returns the live eviction policy, read fresh after every write flush so
   * that AppConfig changes, login changes, and follow-list changes take effect
   * without reopening the store. When omitted, eviction never runs and the
   * cache is append-only (its prior behavior).
   *
   * - `maxAge`: maximum event age in seconds. Events older than `now - maxAge`
   *   are candidates for eviction (subject to the author rules below). A
   *   non-positive value disables eviction.
   * - `protectedPubkeys`: pubkeys whose events are never evicted, regardless of
   *   kind or age (the logged-in accounts).
   * - `followedPubkeys`: pubkeys whose **non-regular** (replaceable/addressable)
   *   events are never evicted; their **regular** events are still evictable
   *   once old. The union of the logged-in accounts' contact lists.
   *
   * An old event is deleted when its author is in neither set, OR its author is
   * only in `followedPubkeys` and the event is regular-kind.
   */
  evictionPolicy?(): {
    maxAge: number;
    protectedPubkeys: Iterable<string>;
    followedPubkeys: Iterable<string>;
  };
}

export class NIndexedDB implements NStore {
  /**
   * Minimum wall-clock gap between eviction passes. Pruning only matters as
   * events age past the cutoff (hours/days), so running it at most hourly is
   * plenty while keeping the cost off the hot write path. The first flush after
   * page load isn't throttled (see `lastEvicted` init), so a session that
   * doesn't last an hour still prunes once on startup.
   */
  private static readonly EVICT_INTERVAL_MS = 60 * 60 * 1000;

  /**
   * Events awaiting a batched write, accumulated across `event()` calls within
   * a single burst (e.g. a feed page). Keyed by id so duplicate writes in the
   * same burst collapse to one.
   */
  private pendingWrites = new Map<string, NostrEvent>();
  /** Callers waiting for the current pending batch to commit. */
  private pendingResolvers: Array<() => void> = [];
  /** Whether a flush is already scheduled for the current burst. */
  private flushScheduled = false;
  /**
   * `Date.now()` of the last eviction pass (0 = never). Eviction is throttled
   * to at most once per {@link NIndexedDB.EVICT_INTERVAL_MS}, so the
   * common case — many write flushes during a browsing session — does at most
   * one prune per interval rather than one per flush. Initialized to 0 so the
   * first flush after page load always runs a pass.
   */
  private lastEvicted = 0;

  private constructor(
    private readonly db: IDBPDatabase<EventsDB> | null,
    private readonly indexTags: (event: NostrEvent) => string[][],
    private readonly evictionPolicy?: () => {
      maxAge: number;
      protectedPubkeys: Iterable<string>;
      followedPubkeys: Iterable<string>;
    },
  ) {}

  /**
   * Default tag index policy: index every single-letter tag with a non-empty
   * value under 200 chars. Matches Nostrify's `NPostgres.indexTags`.
   */
  static indexTags(event: NostrEvent): string[][] {
    return event.tags.filter(([name, value]) => name.length === 1 && !!value && value.length < 200);
  }

  /**
   * Open (or create) the events database. Returns a store whose underlying
   * database may be `null` if IndexedDB is unavailable — in that case every
   * method silently degrades.
   */
  static async open(opts: NIndexedDBOpts = {}): Promise<NIndexedDB> {
    const { name = 'ditto-events', version = 2 } = opts;
    const indexTags = opts.indexTags ?? NIndexedDB.indexTags;

    let db: IDBPDatabase<EventsDB> | null = null;
    try {
      db = await openDB<EventsDB>(name, version, {
        upgrade(db) {
          // The schema is an incompatible rewrite of the old `nostr_events` /
          // `addr` layout. The store is a disposable cache (everything
          // re-fetches from relays), so we drop the old stores and start fresh
          // rather than migrating. Old store names aren't in the typed schema,
          // so iterate via the untyped name list.
          for (const existing of Array.from(db.objectStoreNames) as string[]) {
            db.deleteObjectStore(existing as typeof EVENTS_STORE);
          }

          const store = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
          store.createIndex(INDEX.createdAt, 'created_at');
          store.createIndex(INDEX.pubkey, ['pubkey', 'created_at']);
          store.createIndex(INDEX.kind, ['kind', 'created_at']);
          store.createIndex(INDEX.pubkeyKind, ['pubkey', 'kind', 'created_at']);
          store.createIndex(INDEX.tag, '_tagsCreated', { multiEntry: true });
        },
      });
    } catch {
      // IndexedDB unavailable — degrade to a no-op store.
      db = null;
    }
    return new NIndexedDB(db, indexTags, opts.evictionPolicy);
  }

  // ── Write path ────────────────────────────────────────────────────────────

  /**
   * Add an event to the store. Writes are **batched**: calls are accumulated
   * and flushed together in a single transaction shortly after the current
   * burst settles, keeping writes off the render-critical path. The returned
   * promise resolves once the batch this event belongs to has committed.
   */
  event(event: NostrEvent, _opts?: { signal?: AbortSignal }): Promise<void> {
    if (!this.db) return Promise.resolve();

    // Ephemeral events are never stored.
    if (NKinds.ephemeral(event.kind)) return Promise.resolve();

    // Dedupe within the burst; the latest copy of a given id wins.
    this.pendingWrites.set(event.id, event);

    const done = new Promise<void>((resolve) => {
      this.pendingResolvers.push(resolve);
    });

    this.scheduleFlush();
    return done;
  }

  /**
   * Schedule a single batched flush for the current burst of `event()` calls,
   * deferred off the immediate critical path via `requestIdleCallback` (with a
   * `setTimeout` fallback).
   */
  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;

    const run = () => void this.flushWrites();

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 1000 });
    } else {
      setTimeout(run, 0);
    }
  }

  /**
   * Drain `pendingWrites` and commit them in a single transaction. For each
   * replaceable / addressable event, older versions at the same coordinate are
   * resolved and deleted so queries never return a stale version.
   */
  private async flushWrites(): Promise<void> {
    this.flushScheduled = false;

    const events = [...this.pendingWrites.values()];
    const resolvers = this.pendingResolvers;
    this.pendingWrites = new Map();
    this.pendingResolvers = [];

    if (!this.db || events.length === 0) {
      for (const resolve of resolvers) resolve();
      return;
    }

    try {
      const tx = this.db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);

      // Resolve supersession for every replaceable/addressable event in the
      // batch up front, with all the index reads issued in parallel. Reading
      // them one-at-a-time (await per event) serialized the whole batch behind
      // N round-trips and risked the transaction auto-committing between reads;
      // `Promise.all` lets IndexedDB pipeline them within the single tx.
      const supersession = await this.resolveSupersession(store, events);

      for (const event of events) {
        const superseded = supersession.get(event.id);
        // `null` => an existing (or newer batch sibling) version wins; skip.
        if (superseded === null) continue;
        if (superseded) {
          for (const id of superseded) {
            void store.delete(id);
          }
        }

        void store.put(this.toStored(event));
      }

      await tx.done;
    } catch {
      // Write failure is non-critical — the cache just won't have these events.
    } finally {
      for (const resolve of resolvers) resolve();
    }

    // Prune the cache back under its cap after the batch has committed. This
    // runs off the render-critical path (we're already in a deferred flush) and
    // is best-effort: any failure is swallowed and simply leaves the cache
    // larger than the target.
    await this.maybeEvict();
  }

  /**
   * If an eviction policy is configured, delete events older than the policy's
   * `maxAge`, subject to their author:
   *
   *   - `protectedPubkeys` (logged-in accounts): never deleted, any kind.
   *   - `followedPubkeys`: their non-regular (replaceable/addressable) events
   *     are kept; their regular events are deleted once old.
   *   - everyone else: deleted once old, regardless of kind.
   *
   * The scan is bounded to the `by-created_at` index range below the age
   * cutoff (`[0, cutoff)`), so when no event is old enough the cursor visits
   * nothing — there is no full-store scan and no per-flush thrash when the
   * cache holds only recent or protected events.
   *
   * Passes are additionally throttled to once per
   * {@link NIndexedDB.EVICT_INTERVAL_MS} so a burst of write flushes
   * during normal browsing triggers at most one prune per interval.
   */
  private async maybeEvict(): Promise<void> {
    if (!this.db || !this.evictionPolicy) return;

    // Throttle: skip if we pruned recently. The first call (lastEvicted === 0)
    // always passes, so eviction runs once shortly after page load.
    const now = Date.now();
    if (this.lastEvicted && now - this.lastEvicted < NIndexedDB.EVICT_INTERVAL_MS) return;
    // Stamp up front so overlapping flushes within the interval don't each
    // launch a pass while this one is still running.
    this.lastEvicted = now;

    try {
      const { maxAge, protectedPubkeys, followedPubkeys } = this.evictionPolicy();
      // A non-positive max age disables eviction.
      if (!(maxAge > 0)) return;

      // Everything strictly older than this cutoff is a candidate. created_at
      // is in seconds; `cutoff` is exclusive via the upper-bound `open` flag.
      const cutoff = Math.floor(now / 1000) - maxAge;
      if (cutoff <= 0) return;

      const protectedSet = protectedPubkeys instanceof Set
        ? protectedPubkeys as Set<string>
        : new Set(protectedPubkeys);
      const followedSet = followedPubkeys instanceof Set
        ? followedPubkeys as Set<string>
        : new Set(followedPubkeys);

      const tx = this.db.transaction(EVENTS_STORE, 'readwrite');
      // Only walk the old tail of the index: created_at in [0, cutoff).
      const range = IDBKeyRange.upperBound(cutoff, true);
      let cursor = await tx.objectStore(EVENTS_STORE).index(INDEX.createdAt).openCursor(range, 'next');

      while (cursor) {
        const value = cursor.value as StoredEvent;
        // Logged-in accounts' events are never evicted, regardless of kind.
        // Followed accounts keep their non-regular events but not their regular
        // ones. Everyone else's events are evictable regardless of kind.
        if (!protectedSet.has(value.pubkey)) {
          const keptByFollow = followedSet.has(value.pubkey) && !NKinds.regular(value.kind);
          if (!keptByFollow) {
            void cursor.delete();
          }
        }
        cursor = await cursor.continue();
      }

      await tx.done;
    } catch {
      // Eviction is best-effort; leave the cache oversized on failure.
    }
  }

  /**
   * Resolve replaceable/addressable supersession for an entire write batch in
   * one pass. For each replaceable/addressable event, computes the ids of
   * existing stored events at the same (kind, pubkey, d) coordinate that it
   * supersedes (to delete), `null` if a stored OR same-batch event at that
   * coordinate is newer (so the event should be skipped), or `undefined` for
   * non-replaceable events (no supersession — plain put).
   *
   * All the per-coordinate index reads are issued together via `Promise.all`,
   * so the database pipelines them inside the single write transaction instead
   * of paying for N serialized round-trips.
   */
  private async resolveSupersession(
    store: EventsStore<'readwrite'>,
    events: NostrEvent[],
  ): Promise<Map<string, string[] | null | undefined>> {
    const result = new Map<string, string[] | null | undefined>();

    // Group replaceable/addressable events by coordinate so that, when the same
    // batch carries several versions of one coordinate, only the newest wins
    // (the old per-event loop could write a stale sibling).
    const coords = new Map<string, NostrEvent[]>();
    for (const event of events) {
      if (!NKinds.replaceable(event.kind) && !NKinds.addressable(event.kind)) {
        result.set(event.id, undefined); // plain put, no supersession check
        continue;
      }
      const dTag = NKinds.addressable(event.kind) ? NIndexedDB.getDTag(event) : '';
      const key = `${event.kind}:${event.pubkey}:${dTag}`;
      (coords.get(key) ?? coords.set(key, []).get(key)!).push(event);
    }

    // One index read per coordinate, all in flight at once.
    const entries = [...coords.values()];
    const existingPerCoord = await Promise.all(
      entries.map(([sample]) =>
        store
          .index(INDEX.pubkeyKind)
          .getAll(IDBKeyRange.bound([sample.pubkey, sample.kind, 0], [sample.pubkey, sample.kind, Infinity])) as Promise<
            StoredEvent[]
          >
      ),
    );

    entries.forEach((batchForCoord, i) => {
      const dTag = NKinds.addressable(batchForCoord[0].kind) ? NIndexedDB.getDTag(batchForCoord[0]) : '';
      // Existing stored events at this exact coordinate (filter d for addressable).
      const existing = existingPerCoord[i].filter((other) =>
        !NKinds.addressable(other.kind) || NIndexedDB.getDTag(other) === dTag
      );

      // The single batch winner for this coordinate: newest by NIP-01 ordering.
      const winner = batchForCoord.reduce((a, b) => (NIndexedDB.isNewer(b, a) ? b : a));

      for (const event of batchForCoord) {
        if (event !== winner) {
          result.set(event.id, null); // a newer sibling in this batch wins
        }
      }

      // Does any stored event beat the batch winner? Then skip the winner too.
      const toDelete: string[] = [];
      let storedWins = false;
      for (const other of existing) {
        if (other.id === winner.id) continue; // identical event already stored
        if (NIndexedDB.isNewer(other, winner)) {
          storedWins = true;
          break;
        }
        toDelete.push(other.id);
      }
      result.set(winner.id, storedWins ? null : toDelete);
    });

    return result;
  }

  // ── Read path ───────────────────────────────────────────────────────────

  /**
   * Query events matching the filters (OR'd together), newest-first,
   * de-duplicated by id, each filter's `limit` respected.
   *
   * Reads reflect only what has been committed to IndexedDB. An event that was
   * just `event()`-ed but whose batch hasn't flushed yet is not visible — same
   * as a relay that hasn't yet accepted an `EVENT`. Reads never wait on the
   * write queue.
   */
  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    if (!this.db) return [];

    const byId = new Map<string, NostrEvent>();

    try {
      const tx = this.db.transaction(EVENTS_STORE, 'readonly');
      const store = tx.objectStore(EVENTS_STORE);

      for (const filter of filters) {
        const events = await this.queryFilter(store, new ParsedFilter(filter), opts?.signal);
        for (const event of events) {
          byId.set(event.id, NIndexedDB.fromStored(event));
        }
      }
    } catch {
      return [];
    }

    // Sort the merged result set newest-first (ties: smaller id first).
    return [...byId.values()].sort(NIndexedDB.compareNewest);
  }

  /**
   * Run a single parsed filter against the store using the strfry planner
   * cascade, returning matching events newest-first up to the filter's limit.
   */
  private async queryFilter(
    store: EventsStore<'readonly'>,
    filter: ParsedFilter,
    signal?: AbortSignal,
  ): Promise<StoredEvent[]> {
    if (filter.neverMatch) return [];

    const plan = NIndexedDB.planScan(filter);
    const limit = filter.limit ?? Infinity;

    // Each cursor contributes candidates newest-first; we k-way merge them.
    const collected: StoredEvent[] = [];
    const seen = new Set<string>();

    for (const cursor of plan.cursors) {
      signal?.throwIfAborted();

      const index = cursor.indexName ? store.index(cursor.indexName) : store;
      let idbCursor = await index.openCursor(cursor.range, 'prev');

      // Each cursor walks its prefix newest-first, so its first `limit` matches
      // are its `limit` best candidates — anything older can't beat them in the
      // cross-cursor merge below. Stop early once we have that many; without
      // this, a single prefix (e.g. one prolific author in a feed query) is
      // walked to exhaustion no matter how small the limit, so scan cost grows
      // with the cache instead of with the limit.
      let matched = 0;

      while (idbCursor) {
        signal?.throwIfAborted();
        const value = idbCursor.value as StoredEvent;

        if (seen.has(value.id)) {
          idbCursor = await idbCursor.continue();
          continue;
        }

        // For index-only scans the index guarantees a structural match, so we
        // only re-check the time window. Otherwise re-run the full filter.
        const ok = plan.indexOnly ? filter.matchesTime(value.created_at) : filter.matches(value);
        if (ok) {
          seen.add(value.id);
          collected.push(value);
          if (++matched >= limit) break;
        }

        idbCursor = await idbCursor.continue();
      }
    }

    // Merge across cursors: sort newest-first and truncate to the limit.
    collected.sort(NIndexedDB.compareNewest);
    return Number.isFinite(limit) ? collected.slice(0, limit) : collected;
  }

  /**
   * The query planner — a direct port of strfry's `DBScan` constructor. Picks
   * exactly one index by a fixed priority cascade and builds one cursor (an
   * IndexedDB key range) per discrete value. `since`/`until` are folded into
   * the range bounds; reverse iteration ('prev') yields newest-first.
   */
  private static planScan(filter: ParsedFilter): ScanPlan {
    // created_at is a non-negative unix timestamp, so 0 / +Infinity are safe
    // open bounds. (Both are valid IndexedDB numeric keys; only NaN is not.)
    const since = filter.since ?? 0;
    const until = filter.until ?? Infinity;

    // 1. ids — primary key. The events store's keyPath is `id`, so we range
    //    each id directly (no created_at component on the primary key).
    if (filter.ids) {
      return {
        indexOnly: filter.indexOnly,
        cursors: filter.ids.map((id) => ({
          indexName: undefined,
          range: IDBKeyRange.only(id),
        })),
      };
    }

    // 2. tags — pick the most selective tag filter (fewest values). The tag
    //    name and value are separate key elements, so multi-letter names and
    //    name/value boundaries are unambiguous.
    if (filter.tags.length > 0) {
      const tag = filter.tags.reduce((a, b) => (b.values.length < a.values.length ? b : a));
      return {
        indexOnly: filter.indexOnly,
        cursors: tag.values.map((value) => ({
          indexName: INDEX.tag,
          range: IDBKeyRange.bound([tag.name, value, since], [tag.name, value, until]),
        })),
      };
    }

    // 3. authors + kinds (bounded combinatorial product) — pubkeyKind index.
    if (filter.authors && filter.kinds && filter.authors.length * filter.kinds.length < 1000) {
      const cursors: ScanCursor[] = [];
      for (const author of filter.authors) {
        for (const kind of filter.kinds) {
          cursors.push({
            indexName: INDEX.pubkeyKind,
            range: IDBKeyRange.bound([author, kind, since], [author, kind, until]),
          });
        }
      }
      return { indexOnly: filter.indexOnly, cursors };
    }

    // 4. authors — pubkey index. If kinds is also present (product too large),
    //    kinds gets enforced by the post-filter, so this can't be index-only.
    if (filter.authors) {
      return {
        indexOnly: filter.indexOnly && !filter.kinds,
        cursors: filter.authors.map((author) => ({
          indexName: INDEX.pubkey,
          range: IDBKeyRange.bound([author, since], [author, until]),
        })),
      };
    }

    // 5. kinds — kind index.
    if (filter.kinds) {
      return {
        indexOnly: filter.indexOnly,
        cursors: filter.kinds.map((kind) => ({
          indexName: INDEX.kind,
          range: IDBKeyRange.bound([kind, since], [kind, until]),
        })),
      };
    }

    // 6. fallback — full created_at scan over the whole store.
    return {
      indexOnly: filter.indexOnly,
      cursors: [{
        indexName: INDEX.createdAt,
        range: IDBKeyRange.bound(since, until),
      }],
    };
  }

  /** COUNT support: number of matching events. */
  async count(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<{ count: number }> {
    const events = await this.query(filters, opts);
    return { count: events.length };
  }

  /** Remove events matching the filters. */
  async remove(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<void> {
    if (!this.db) return;
    const events = await this.query(filters, opts);
    try {
      const tx = this.db.transaction(EVENTS_STORE, 'readwrite');
      await Promise.all(events.map((e) => tx.store.delete(e.id)));
      await tx.done;
    } catch {
      // Non-critical.
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Build the stored representation (event + derived index fields). */
  private toStored(event: NostrEvent): StoredEvent {
    const tagsCreated: Array<[string, string, number]> = [];
    const seen = new Set<string>();
    for (const [name, value] of this.indexTags(event)) {
      if (typeof name !== 'string' || typeof value !== 'string') continue;
      // Collapse duplicate (name, value) pairs. The NUL separator can't appear
      // in the parts, so distinct pairs never collide in the dedupe set.
      const dedupeKey = `${name}\u0000${value}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      tagsCreated.push([name, value, event.created_at]);
    }
    return tagsCreated.length > 0 ? { ...event, _tagsCreated: tagsCreated } : { ...event };
  }

  /** Strip derived index fields, returning a clean NostrEvent. */
  private static fromStored(stored: StoredEvent): NostrEvent {
    if (!('_tagsCreated' in stored)) return stored;
    const { _tagsCreated: _omit, ...event } = stored;
    return event;
  }

  /** The `d` tag value of an event (defaults to ""). */
  private static getDTag(event: NostrEvent): string {
    return event.tags.find(([name]) => name === 'd')?.[1] ?? '';
  }

  /**
   * Per NIP-01, `a` is "newer" than `b` (same coordinate) when its created_at
   * is greater, or — on a tie — its id is lexicographically smaller.
   */
  private static isNewer(a: NostrEvent, b: NostrEvent): boolean {
    if (a.created_at > b.created_at) return true;
    if (a.created_at < b.created_at) return false;
    return a.id < b.id;
  }

  /** Comparator that orders events newest-first (ties: smaller id first). */
  private static compareNewest(a: NostrEvent, b: NostrEvent): number {
    if (a.created_at !== b.created_at) return b.created_at - a.created_at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }
}

/** Names of the secondary indexes on the events store. */
type IndexName = (typeof INDEX)[keyof typeof INDEX];

/** One cursor in a scan: an index (or the primary store) plus a key range. */
interface ScanCursor {
  /** Index name, or `undefined` to scan the primary key (event id). */
  indexName?: IndexName;
  range: IDBKeyRange;
}

/** A planned scan: the chosen cursors and whether the index alone suffices. */
interface ScanPlan {
  indexOnly: boolean;
  cursors: ScanCursor[];
}
