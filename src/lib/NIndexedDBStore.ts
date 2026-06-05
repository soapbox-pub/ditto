import { openDB, type IDBPDatabase } from 'idb';
import { type NostrEvent, type NostrFilter, NKinds, type NStore } from '@nostrify/nostrify';

// ============================================================================
// NIndexedDBStore — a deliberately minimal `NStore` backed by IndexedDB.
//
// This is NOT a general-purpose relay store. It implements the full `NStore`
// interface, but only understands two filter shapes:
//
//   1. ID filters:    { "ids": [A, B, C] }
//   2. Addr filters:  { "kinds": [0], "authors": [alex] }
//                     { "kinds": [30000], "authors": [alex], "#d": ["my-list"] }
//
// Anything else (tag filters, time ranges, search, kind-only, etc.) returns
// no events. The point is a fast local cache for "give me this exact event"
// and "give me alex's latest kind 0 / addressable event", not a full index.
//
// Storage layout:
//   - `nostr_events`  object store, keyed by event id, holding the raw event.
//   - `addr`          object store, keyed by an addr string (see `addrKey`),
//                     holding { id, created_at }. This is the replaceable /
//                     addressable pointer: the id of the newest event for a
//                     given (kind, pubkey, d) coordinate, plus its created_at
//                     so we know when an incoming event should move the pointer.
//
// We never delete superseded events from `nostr_events`; we only move the
// `addr` pointer. Old rows are harmless and only reachable by their exact id.
//
// When IndexedDB is unavailable (iOS Lockdown Mode, some private-browsing
// contexts) the store degrades to a no-op: `event()` does nothing and
// `query()` returns `[]`.
// ============================================================================

interface AddrPointer {
  /** Event id of the newest event at this addr coordinate. */
  id: string;
  /** created_at of that event, used to decide whether to move the pointer. */
  created_at: number;
}

export interface NIndexedDBStoreOpts {
  /** Database name. Defaults to `ditto-events`. */
  name?: string;
  /** Schema version. Defaults to `1`. */
  version?: number;
  /** Object store holding raw events, keyed by id. Defaults to `nostr_events`. */
  eventsStore?: string;
  /** Object store holding addr pointers. Defaults to `addr`. */
  addrStore?: string;
}

export class NIndexedDBStore implements NStore {
  private constructor(
    private readonly db: IDBPDatabase | null,
    private readonly eventsStore: string,
    private readonly addrStore: string,
  ) {}

  /**
   * Open (or create) the events database. Returns a store whose underlying
   * database may be `null` if IndexedDB is unavailable — in that case every
   * method silently degrades.
   */
  static async open(opts: NIndexedDBStoreOpts = {}): Promise<NIndexedDBStore> {
    const {
      name = 'ditto-events',
      version = 1,
      eventsStore = 'nostr_events',
      addrStore = 'addr',
    } = opts;

    let db: IDBPDatabase | null = null;
    try {
      db = await openDB(name, version, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(eventsStore)) {
            db.createObjectStore(eventsStore, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(addrStore)) {
            db.createObjectStore(addrStore);
          }
        },
      });
    } catch {
      // IndexedDB unavailable — degrade to a no-op store.
      db = null;
    }
    return new NIndexedDBStore(db, eventsStore, addrStore);
  }

  /**
   * Add an event to the store.
   *
   * - The raw event is always stored in `nostr_events`, keyed by id.
   * - For replaceable / addressable events, the `addr` pointer is moved to
   *   this event when it is newer than the current pointer (newer = greater
   *   created_at, tie broken by lexicographically smaller id per NIP-01).
   * - Regular events have no addr pointer; they're only reachable by id.
   */
  async event(event: NostrEvent, _opts?: { signal?: AbortSignal }): Promise<void> {
    if (!this.db) return;

    const replaceable = NKinds.replaceable(event.kind);
    const addressable = NKinds.addressable(event.kind);

    try {
      if (!replaceable && !addressable) {
        await this.db.put(this.eventsStore, event);
        return;
      }

      const key = NIndexedDBStore.addrKey(
        event.kind,
        event.pubkey,
        addressable ? NIndexedDBStore.getDTag(event) : '',
      );

      const tx = this.db.transaction([this.eventsStore, this.addrStore], 'readwrite');
      const addrStore = tx.objectStore(this.addrStore);
      const existing: AddrPointer | undefined = await addrStore.get(key);

      if (!existing || NIndexedDBStore.isNewer(event, existing)) {
        await addrStore.put({ id: event.id, created_at: event.created_at }, key);
      }

      await tx.objectStore(this.eventsStore).put(event);
      await tx.done;
    } catch {
      // Write failure is non-critical — the cache just won't have this event.
    }
  }

  /**
   * Query events matching the filters. Only `ids` filters and addr filters
   * (kinds + authors [+ #d]) are understood; every other shape contributes
   * no events. Results are de-duplicated by id.
   */
  async query(filters: NostrFilter[], _opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    if (!this.db) return [];

    const byId = new Map<string, NostrEvent>();

    try {
      for (const filter of filters) {
        const events = await this.queryFilter(filter);
        for (const event of events) {
          byId.set(event.id, event);
        }
      }
    } catch {
      return [];
    }

    return [...byId.values()];
  }

  /**
   * COUNT support: return the number of matching events. Implemented on top of
   * `query()` since our supported shapes are cheap to resolve.
   */
  async count(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<{ count: number }> {
    const events = await this.query(filters, opts);
    return { count: events.length };
  }

  /**
   * Remove events matching the filters. Deletes from `nostr_events`; addr
   * pointers to removed ids are left dangling but harmless (a `query()` for
   * that addr will resolve the pointer to a missing event and drop it).
   */
  async remove(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<void> {
    if (!this.db) return;
    const events = await this.query(filters, opts);
    try {
      const tx = this.db.transaction(this.eventsStore, 'readwrite');
      await Promise.all(events.map((e) => tx.store.delete(e.id)));
      await tx.done;
    } catch {
      // Non-critical.
    }
  }

  /** Resolve a single filter to its matching events, or `[]` if unsupported. */
  private async queryFilter(filter: NostrFilter): Promise<NostrEvent[]> {
    if (!this.db) return [];

    // ── ID filter: { ids: [...] } ──────────────────────────────────────────
    if (NIndexedDBStore.isIdsFilter(filter)) {
      const ids = (filter.ids ?? []).filter(NIndexedDBStore.isHex64);
      return this.getEvents(ids);
    }

    // ── Addr filter: { kinds, authors, [#d] } ──────────────────────────────
    if (NIndexedDBStore.isAddrFilter(filter)) {
      const kinds = filter.kinds ?? [];
      const authors = (filter.authors ?? []).filter(NIndexedDBStore.isHex64);
      const dTags = filter['#d'];

      const keys: string[] = [];
      for (const kind of kinds) {
        for (const author of authors) {
          if (NKinds.addressable(kind)) {
            // Addressable: a #d tag is required to identify the coordinate.
            for (const d of dTags ?? []) {
              keys.push(NIndexedDBStore.addrKey(kind, author, d));
            }
          } else {
            // Replaceable (or legacy single-instance): the d slot is always "".
            keys.push(NIndexedDBStore.addrKey(kind, author, ''));
          }
        }
      }

      const pointers = await Promise.all(
        keys.map((key) => this.db!.get(this.addrStore, key) as Promise<AddrPointer | undefined>),
      );

      const ids = pointers.filter((p): p is AddrPointer => !!p).map((p) => p.id);
      return this.getEvents(ids);
    }

    // Unsupported filter shape — contribute nothing.
    return [];
  }

  /** Fetch a set of events by id, dropping any that aren't present. */
  private async getEvents(ids: string[]): Promise<NostrEvent[]> {
    const events = await Promise.all(
      ids.map((id) => this.db!.get(this.eventsStore, id) as Promise<NostrEvent | undefined>),
    );
    return events.filter((e): e is NostrEvent => !!e);
  }

  /**
   * An ID filter is a filter whose ONLY constraint is `ids`. Adding kinds,
   * authors, time ranges, etc. would require real indexing we don't have, so
   * those fall through to "unsupported".
   */
  private static isIdsFilter(filter: NostrFilter): boolean {
    if (!Array.isArray(filter.ids) || filter.ids.length === 0) return false;
    return Object.keys(filter).every((k) => k === 'ids' || k === 'limit');
  }

  /**
   * An addr filter constrains `kinds` and `authors` (and optionally `#d`).
   * No other constraints are supported.
   */
  private static isAddrFilter(filter: NostrFilter): boolean {
    if (!Array.isArray(filter.kinds) || filter.kinds.length === 0) return false;
    if (!Array.isArray(filter.authors) || filter.authors.length === 0) return false;

    const allowed = new Set(['kinds', 'authors', '#d', 'limit']);
    return Object.keys(filter).every((k) => allowed.has(k));
  }

  /** The `d` tag value of an event (defaults to ""). */
  private static getDTag(event: NostrEvent): string {
    return event.tags.find(([name]) => name === 'd')?.[1] ?? '';
  }

  /** Build the addr index key for a (kind, pubkey, d) coordinate. */
  private static addrKey(kind: number, pubkey: string, d: string): string {
    return `${kind}:${pubkey}:${d}`;
  }

  /**
   * A NIP-01 `id` is 64 lowercase hex chars. We validate before using values
   * as IndexedDB keys so a malformed filter can't poison the store or throw.
   */
  private static isHex64(value: unknown): value is string {
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  }

  /**
   * Per NIP-01, an event is "newer" than another with the same coordinate when
   * its created_at is greater, or — on a tie — its id is lexicographically
   * smaller. Compares an incoming event to the stored addr pointer.
   */
  private static isNewer(event: NostrEvent, pointer: AddrPointer): boolean {
    if (event.created_at > pointer.created_at) return true;
    if (event.created_at < pointer.created_at) return false;
    return event.id < pointer.id;
  }
}
