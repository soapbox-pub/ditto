import type { NostrEvent, NostrFilter } from '@nostrify/types';
import type { NPool } from '@nostrify/nostrify';

/** Maximum number of items per batch to avoid hitting relay filter limits. */
const MAX_BATCH_SIZE = 50;

/**
 * Pending request waiting for a batched query result.
 * Each caller gets its own resolve/reject and optional abort signal.
 */
interface PendingRequest<V> {
  key: string;
  resolve: (value: V) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
}

/**
 * A batch collector that accumulates requests during the current microtask
 * and then fires a single combined query.
 */
class BatchCollector<V> {
  private pending: PendingRequest<V>[] = [];
  private scheduled = false;

  constructor(
    private executeBatch: (keys: string[], signal: AbortSignal) => Promise<Map<string, V>>,
  ) {}

  /** Enqueue a request. Returns a promise that resolves when the batch completes. */
  request(key: string, signal?: AbortSignal): Promise<V> {
    return new Promise<V>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }

      this.pending.push({ key, resolve, reject, signal });

      if (!this.scheduled) {
        this.scheduled = true;
        queueMicrotask(() => this.flush());
      }
    });
  }

  /** Drain the pending queue and execute the batch. */
  private async flush(): Promise<void> {
    const batch = this.pending;
    this.pending = [];
    this.scheduled = false;

    if (batch.length === 0) return;

    const live = batch.filter((req) => !req.signal?.aborted);
    const aborted = batch.filter((req) => req.signal?.aborted);

    for (const req of aborted) {
      req.reject(req.signal!.reason);
    }

    if (live.length === 0) return;

    // Deduplicate keys.
    const uniqueKeys: string[] = [];
    const seen = new Set<string>();
    for (const req of live) {
      if (!seen.has(req.key)) {
        seen.add(req.key);
        uniqueKeys.push(req.key);
      }
    }

    // Combined abort: only abort when ALL callers have aborted.
    const controller = new AbortController();
    const liveSignals = live.map((r) => r.signal).filter(Boolean) as AbortSignal[];
    if (liveSignals.length > 0 && liveSignals.length === live.length) {
      const checkAllAborted = () => {
        if (liveSignals.every((s) => s.aborted)) {
          controller.abort(liveSignals[0].reason);
        }
      };
      for (const sig of liveSignals) {
        sig.addEventListener('abort', checkAllAborted, { once: true });
      }
    }

    try {
      // Chunk to respect relay limits.
      const allResults = new Map<string, V>();
      const chunks: string[][] = [];
      for (let i = 0; i < uniqueKeys.length; i += MAX_BATCH_SIZE) {
        chunks.push(uniqueKeys.slice(i, i + MAX_BATCH_SIZE));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          const results = await this.executeBatch(chunk, controller.signal);
          for (const [key, value] of results) {
            allResults.set(key, value);
          }
        }),
      );

      for (const req of live) {
        if (req.signal?.aborted) {
          req.reject(req.signal.reason);
        } else {
          req.resolve(allResults.get(req.key) as V);
        }
      }
    } catch (error) {
      for (const req of live) {
        req.reject(error);
      }
    }
  }
}

// --- Filter pattern detection ---

/** A filter that only fetches events by ID: `{ ids: [x], limit?: n }` */
function isIdsOnlyFilter(filter: NostrFilter): filter is { ids: string[]; limit?: number } {
  const keys = Object.keys(filter);
  return keys.every((k) => k === 'ids' || k === 'limit') && Array.isArray(filter.ids) && filter.ids.length === 1;
}

/**
 * Replaceable kinds that are fetched once per author and can be merged into a
 * single multi-kind query when multiple hooks request different kinds for the
 * same pubkey in the same microtask tick.
 */
const REPLACEABLE_KINDS = new Set([0, 3, 10000, 10001, 10002, 10003, 16767]);

/**
 * A filter that fetches a single replaceable event by author:
 * `{ kinds: [k], authors: [a], limit?: n }` where k is a known replaceable kind.
 */
function isReplaceableFilter(filter: NostrFilter): boolean {
  const keys = Object.keys(filter);
  return (
    keys.every((k) => k === 'kinds' || k === 'authors' || k === 'limit') &&
    filter.kinds?.length === 1 &&
    REPLACEABLE_KINDS.has(filter.kinds[0]) &&
    filter.authors?.length === 1 &&
    filter.limit !== undefined
  );
}

/**
 * Batches replaceable-kind queries by pubkey across a microtask window.
 *
 * When multiple hooks request different kinds for the same pubkey
 * (e.g. kind 0 from useAuthor, kind 3 from useFollowList, kind 10000 from
 * useMuteList), they are merged into one REQ:
 *   { kinds: [0, 3, 10000], authors: [pubkey], limit: 3 }
 *
 * Each caller still gets back only its own event (or undefined).
 */
class ReplaceableCollector {
  /** Pending requests keyed by `${pubkey}:${kind}`. */
  private pending: Array<{
    pubkey: string;
    kind: number;
    resolve: (event: NostrEvent | undefined) => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
  }> = [];
  private scheduled = false;

  constructor(
    private pool: NPool,
  ) {}

  request(pubkey: string, kind: number, signal?: AbortSignal): Promise<NostrEvent | undefined> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      this.pending.push({ pubkey, kind, resolve, reject, signal });
      if (!this.scheduled) {
        this.scheduled = true;
        queueMicrotask(() => this.flush());
      }
    });
  }

  private async flush(): Promise<void> {
    const batch = this.pending;
    this.pending = [];
    this.scheduled = false;

    if (batch.length === 0) return;

    const live = batch.filter((r) => !r.signal?.aborted);
    for (const r of batch.filter((r) => r.signal?.aborted)) {
      r.reject(r.signal!.reason);
    }
    if (live.length === 0) return;

    // Collect unique kinds per pubkey.
    const kindsByPubkey = new Map<string, Set<number>>();
    for (const { pubkey, kind } of live) {
      if (!kindsByPubkey.has(pubkey)) kindsByPubkey.set(pubkey, new Set());
      kindsByPubkey.get(pubkey)!.add(kind);
    }

    // Group pubkeys by their kind-set so pubkeys requesting the same kinds
    // (e.g. all NoteCard authors requesting only kind 0) are fetched in one REQ.
    const byKindSet = new Map<string, { kinds: number[]; pubkeys: string[] }>();
    for (const [pubkey, kinds] of kindsByPubkey) {
      const key = [...kinds].sort((a, b) => a - b).join(',');
      if (!byKindSet.has(key)) byKindSet.set(key, { kinds: [...kinds].sort((a, b) => a - b), pubkeys: [] });
      byKindSet.get(key)!.pubkeys.push(pubkey);
    }

    // Combined abort: only abort when ALL callers have aborted.
    const controller = new AbortController();
    const liveSignals = live.map((r) => r.signal).filter(Boolean) as AbortSignal[];
    if (liveSignals.length > 0 && liveSignals.length === live.length) {
      const checkAllAborted = () => {
        if (liveSignals.every((s) => s.aborted)) controller.abort(liveSignals[0].reason);
      };
      for (const sig of liveSignals) sig.addEventListener('abort', checkAllAborted, { once: true });
    }

    // results[pubkey][kind] = event | undefined
    const results = new Map<string, Map<number, NostrEvent | undefined>>();

    try {
      await Promise.all(
        [...byKindSet.values()].map(async ({ kinds, pubkeys }) => {
          const events = await this.pool.query(
            [{ kinds, authors: pubkeys, limit: kinds.length * pubkeys.length }],
            { signal: controller.signal },
          );
          // Index by pubkey+kind, pick newest per pair.
          for (const pubkey of pubkeys) {
            if (!results.has(pubkey)) results.set(pubkey, new Map());
          }
          for (const event of events) {
            const kindMap = results.get(event.pubkey);
            if (!kindMap) continue;
            const existing = kindMap.get(event.kind);
            if (!existing || event.created_at > existing.created_at) {
              kindMap.set(event.kind, event);
            }
          }
        }),
      );
    } catch (error) {
      for (const r of live) r.reject(error);
      return;
    }

    // Retry kind 0 profiles not found in the initial query against the loser
    // relays. The relay race (eoseTimeout) resolves as soon as the first relay
    // sends EOSE, so slower relays may not have had time to return all profiles.
    // Collect the missing pubkeys and issue a second batched query so those
    // relays get a full chance to respond.
    const missingKind0Pubkeys = [...byKindSet.values()]
      .filter(({ kinds }) => kinds.includes(0))
      .flatMap(({ pubkeys }) => pubkeys)
      .filter((pubkey) => !results.get(pubkey)?.get(0));

    if (missingKind0Pubkeys.length > 0 && !controller.signal.aborted) {
      try {
        // Chunk into batches to respect relay filter limits.
        const chunks: string[][] = [];
        for (let i = 0; i < missingKind0Pubkeys.length; i += MAX_BATCH_SIZE) {
          chunks.push(missingKind0Pubkeys.slice(i, i + MAX_BATCH_SIZE));
        }

        await Promise.all(
          chunks.map(async (chunk) => {
            const retryEvents = await this.pool.query(
              [{ kinds: [0], authors: chunk, limit: chunk.length }],
              { signal: controller.signal },
            );
            for (const event of retryEvents) {
              if (!results.has(event.pubkey)) results.set(event.pubkey, new Map());
              const kindMap = results.get(event.pubkey)!;
              const existing = kindMap.get(0);
              if (!existing || event.created_at > existing.created_at) {
                kindMap.set(0, event);
              }
            }
          }),
        );
      } catch {
        // Retry failure is non-fatal — callers still get the initial results.
      }
    }

    for (const r of live) {
      if (r.signal?.aborted) {
        r.reject(r.signal.reason);
      } else {
        r.resolve(results.get(r.pubkey)?.get(r.kind));
      }
    }
  }
}

/** A filter for kind:7 reactions by a single author to a single event. */
function isReactionFilter(filter: NostrFilter): boolean {
  const keys = Object.keys(filter);
  return (
    keys.every((k) => k === 'kinds' || k === 'authors' || k === '#e' || k === 'limit') &&
    filter.kinds?.length === 1 &&
    filter.kinds[0] === 7 &&
    filter.authors?.length === 1 &&
    (filter as Record<string, unknown>)['#e'] !== undefined &&
    (Array.isArray((filter as Record<string, unknown>)['#e']) && ((filter as Record<string, unknown>)['#e'] as string[]).length === 1)
  );
}

/** A filter for kind:6/16 reposts by a single author to a single event. */
function isRepostFilter(filter: NostrFilter): boolean {
  const keys = Object.keys(filter);
  const kinds = filter.kinds;
  if (!kinds || kinds.length === 0) return false;
  const eTag = (filter as Record<string, unknown>)['#e'];
  return (
    keys.every((k) => k === 'kinds' || k === 'authors' || k === '#e' || k === 'limit') &&
    kinds.every((k) => k === 6 || k === 16) &&
    filter.authors?.length === 1 &&
    eTag !== undefined &&
    Array.isArray(eTag) &&
    (eTag as string[]).length === 1
  );
}

/**
 * A filter that queries by a single `#e` tag with kinds and limit.
 * e.g. `{ kinds: [7, 9735], '#e': [eventId], limit: 10 }`
 * Must NOT have `authors` (that's the reaction pattern).
 */
function isETagFilter(filter: NostrFilter): boolean {
  const keys = Object.keys(filter);
  return (
    keys.every((k) => k === 'kinds' || k === '#e' || k === 'limit') &&
    Array.isArray(filter.kinds) &&
    filter.kinds.length > 0 &&
    !filter.authors &&
    (filter as Record<string, unknown>)['#e'] !== undefined &&
    Array.isArray((filter as Record<string, unknown>)['#e']) &&
    ((filter as Record<string, unknown>)['#e'] as string[]).length === 1
  );
}

/**
 * Extract the single `#e` value from a filter known to have one.
 */
function getETagValue(filter: NostrFilter): string {
  return ((filter as Record<string, unknown>)['#e'] as string[])[0];
}

/**
 * Check if a multi-filter array can be batched: every filter must be an
 * e-tag or q-tag filter referencing the same single event ID.
 * e.g. [{ kinds: [7, 9735], '#e': [id], limit: 10 }, { kinds: [1], '#q': [id], limit: 5 }]
 */
function isMultiFilterETagBatchable(filters: NostrFilter[]): string | null {
  if (filters.length < 2) return null;
  let commonId: string | null = null;

  for (const filter of filters) {
    const keys = Object.keys(filter);
    // Each filter must only have kinds + (#e or #q) + optional limit
    const isEFilter = keys.every((k) => k === 'kinds' || k === '#e' || k === 'limit') &&
      (filter as Record<string, unknown>)['#e'] !== undefined &&
      Array.isArray((filter as Record<string, unknown>)['#e']) &&
      ((filter as Record<string, unknown>)['#e'] as string[]).length === 1;

    const isQFilter = keys.every((k) => k === 'kinds' || k === '#q' || k === 'limit') &&
      (filter as Record<string, unknown>)['#q'] !== undefined &&
      Array.isArray((filter as Record<string, unknown>)['#q']) &&
      ((filter as Record<string, unknown>)['#q'] as string[]).length === 1;

    if (!isEFilter && !isQFilter) return null;

    const id = isEFilter
      ? ((filter as Record<string, unknown>)['#e'] as string[])[0]
      : ((filter as Record<string, unknown>)['#q'] as string[])[0];

    if (commonId === null) {
      commonId = id;
    } else if (id !== commonId) {
      return null; // Different IDs, can't batch
    }
  }

  return commonId;
}

/** A filter for addressable events by d-tag: `{ kinds: [k], authors: [a], '#d': [d], limit?: n }` */
function isDTagFilter(filter: NostrFilter): boolean {
  const keys = Object.keys(filter);
  return (
    keys.every((k) => k === 'kinds' || k === 'authors' || k === '#d' || k === 'limit') &&
    filter.kinds?.length === 1 &&
    filter.authors?.length === 1 &&
    (filter as Record<string, unknown>)['#d'] !== undefined &&
    (Array.isArray((filter as Record<string, unknown>)['#d']) && ((filter as Record<string, unknown>)['#d'] as string[]).length === 1)
  );
}

/**
 * Transparent batching proxy for NPool.
 *
 * Wraps an NPool and intercepts `.query()` calls. When a query uses a
 * recognizable single-item filter pattern (fetch by ID, profile by pubkey,
 * reaction check, d-tag lookup), the request is held for a microtask.
 * If more queries with the same pattern arrive in the same frame, they're
 * combined into one REQ.
 *
 * All other methods (`.event()`, `.req()`, `.relay()`, `.group()`, `.close()`)
 * pass through directly to the underlying pool.
 *
 * Client code doesn't need to know batching exists — it calls
 * `nostr.query([{ kinds: [0], authors: [pk], limit: 1 }])` as usual.
 */
export class NostrBatcher {
  /** Batches replaceable-kind queries by pubkey, merging kinds per pubkey into one REQ. */
  private replaceableCollector: ReplaceableCollector;
  private eventCollector: BatchCollector<NostrEvent | undefined>;
  /** Keyed by userPubkey so each user's reactions batch separately. */
  private reactionCollectors = new Map<string, BatchCollector<NostrEvent | undefined>>();
  /** Keyed by `${userPubkey}:${kindsKey}` so each user's reposts batch separately per kind set. */
  private repostCollectors = new Map<string, BatchCollector<NostrEvent | undefined>>();
  /** Keyed by `${kind}:${author}` for d-tag batching. */
  private dTagCollectors = new Map<string, BatchCollector<NostrEvent | undefined>>();
  /** Keyed by sorted kinds string for #e-tag batching. Returns arrays. */
  private eTagCollectors = new Map<string, BatchCollector<NostrEvent[]>>();
  /** Keyed by serialized filter shapes for multi-filter #e/#q batching. */
  private multiFilterCollectors = new Map<string, BatchCollector<NostrEvent[]>>();

  constructor(private pool: NPool) {
    this.replaceableCollector = new ReplaceableCollector(pool);
    this.eventCollector = new BatchCollector((ids, signal) =>
      this.executeEventBatch(ids, signal),
    );
  }

  /**
   * Proxy for `pool.query()`. Detects batchable filter patterns and
   * combines them; everything else passes through directly.
   */
  async query(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): Promise<NostrEvent[]> {
    // Only batch single-filter queries with recognized patterns.
    if (filters.length === 1) {
      const filter = filters[0];

      // { ids: [singleId] }
      if (isIdsOnlyFilter(filter)) {
        const event = await this.eventCollector.request(filter.ids[0], opts?.signal);
        return event ? [event] : [];
      }

      // { kinds: [replaceableKind], authors: [singlePubkey] }
      if (isReplaceableFilter(filter)) {
        const event = await this.replaceableCollector.request(filter.authors![0], filter.kinds![0], opts?.signal);
        return event ? [event] : [];
      }

      // { kinds: [7], authors: [user], '#e': [eventId] }
      if (isReactionFilter(filter)) {
        const userPubkey = filter.authors![0];
        const eventId = ((filter as Record<string, unknown>)['#e'] as string[])[0];
        let collector = this.reactionCollectors.get(userPubkey);
        if (!collector) {
          collector = new BatchCollector((eventIds, signal) =>
            this.executeReactionBatch(userPubkey, eventIds, signal),
          );
          this.reactionCollectors.set(userPubkey, collector);
        }
        const event = await collector.request(eventId, opts?.signal);
        return event ? [event] : [];
      }

      // { kinds: [6, 16], authors: [user], '#e': [eventId] }
      if (isRepostFilter(filter)) {
        const userPubkey = filter.authors![0];
        const eventId = ((filter as Record<string, unknown>)['#e'] as string[])[0];
        const kindsKey = [...filter.kinds!].sort().join(',');
        const collectorKey = `${userPubkey}:${kindsKey}`;
        let collector = this.repostCollectors.get(collectorKey);
        if (!collector) {
          collector = new BatchCollector((eventIds, signal) =>
            this.executeRepostBatch(userPubkey, filter.kinds!, eventIds, signal),
          );
          this.repostCollectors.set(collectorKey, collector);
        }
        const event = await collector.request(eventId, opts?.signal);
        return event ? [event] : [];
      }

      // { kinds: [...], '#e': [eventId] } (no authors — not a reaction check)
      if (isETagFilter(filter)) {
        const eventId = getETagValue(filter);
        const kindsKey = [...filter.kinds!].sort().join(',');
        const limit = filter.limit ?? 50;
        const collectorKey = `${kindsKey}:${limit}`;
        let collector = this.eTagCollectors.get(collectorKey);
        if (!collector) {
          collector = new BatchCollector((eventIds, signal) =>
            this.executeETagBatch(filter.kinds!, eventIds, limit, signal),
          );
          this.eTagCollectors.set(collectorKey, collector);
        }
        return collector.request(eventId, opts?.signal);
      }

      // { kinds: [k], authors: [a], '#d': [d] }
      if (isDTagFilter(filter)) {
        const kind = filter.kinds![0];
        const author = filter.authors![0];
        const dTag = ((filter as Record<string, unknown>)['#d'] as string[])[0];
        const collectorKey = `${kind}:${author}`;
        let collector = this.dTagCollectors.get(collectorKey);
        if (!collector) {
          collector = new BatchCollector((dTags, signal) =>
            this.executeDTagBatch(kind, author, dTags, signal),
          );
          this.dTagCollectors.set(collectorKey, collector);
        }
        const event = await collector.request(dTag, opts?.signal);
        return event ? [event] : [];
      }
    }

    // Multi-filter: check if all filters reference the same #e/#q event ID
    const multiFilterEventId = isMultiFilterETagBatchable(filters);
    if (multiFilterEventId !== null) {
      // Serialize the filter "shape" (kinds, tag names, limits) to get a collector key.
      // Multi-filter queries with the same shape are batched together.
      const shapeKey = filters.map((f) => {
        const keys = Object.keys(f).sort();
        return keys.map((k) => k === '#e' || k === '#q' ? k : `${k}:${JSON.stringify((f as Record<string, unknown>)[k])}`).join('|');
      }).join(';;');

      let collector = this.multiFilterCollectors.get(shapeKey);
      if (!collector) {
        collector = new BatchCollector((eventIds, signal) =>
          this.executeMultiFilterBatch(filters, eventIds, signal),
        );
        this.multiFilterCollectors.set(shapeKey, collector);
      }
      return collector.request(multiFilterEventId, opts?.signal);
    }

    // Not batchable — pass through directly.
    return this.pool.query(filters, opts);
  }

  // --- Pass-through methods ---

  event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    return this.pool.event(event, opts);
  }

  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<import('@nostrify/types').NostrRelayEVENT | import('@nostrify/types').NostrRelayEOSE | import('@nostrify/types').NostrRelayCLOSED> {
    return this.pool.req(filters, opts);
  }

  relay(url: string) {
    return this.pool.relay(url);
  }

  group(urls: string[]) {
    return this.pool.group(urls);
  }

  close(): Promise<void> {
    return this.pool.close();
  }

  // --- Batch executors ---

  private async executeRepostBatch(
    userPubkey: string,
    kinds: number[],
    eventIds: string[],
    signal: AbortSignal,
  ): Promise<Map<string, NostrEvent | undefined>> {
    const results = new Map<string, NostrEvent | undefined>();
    try {
      const events = await this.pool.query(
        [{ kinds, authors: [userPubkey], '#e': eventIds, limit: eventIds.length }],
        { signal },
      );
      const repostMap = new Map<string, NostrEvent>();
      for (const event of events) {
        const eTag = event.tags.find(([name]) => name === 'e')?.[1];
        if (!eTag) continue;
        const existing = repostMap.get(eTag);
        if (!existing || event.created_at > existing.created_at) {
          repostMap.set(eTag, event);
        }
      }
      for (const eventId of eventIds) {
        results.set(eventId, repostMap.get(eventId));
      }
    } catch {
      for (const eventId of eventIds) {
        results.set(eventId, undefined);
      }
    }
    return results;
  }

  private async executeEventBatch(
    ids: string[],
    signal: AbortSignal,
  ): Promise<Map<string, NostrEvent | undefined>> {
    const results = new Map<string, NostrEvent | undefined>();
    try {
      const events = await this.pool.query(
        [{ ids, limit: ids.length }],
        { signal },
      );
      const byId = new Map<string, NostrEvent>();
      for (const event of events) {
        byId.set(event.id, event);
      }
      for (const id of ids) {
        results.set(id, byId.get(id));
      }
    } catch {
      for (const id of ids) {
        results.set(id, undefined);
      }
    }
    return results;
  }

  private async executeReactionBatch(
    userPubkey: string,
    eventIds: string[],
    signal: AbortSignal,
  ): Promise<Map<string, NostrEvent | undefined>> {
    const results = new Map<string, NostrEvent | undefined>();
    try {
      const events = await this.pool.query(
        [{ kinds: [7], authors: [userPubkey], '#e': eventIds, limit: eventIds.length }],
        { signal },
      );
      const reactionMap = new Map<string, NostrEvent>();
      for (const event of events) {
        const eTag = event.tags.findLast(([name]) => name === 'e')?.[1];
        if (!eTag) continue;
        const existing = reactionMap.get(eTag);
        if (!existing || event.created_at > existing.created_at) {
          reactionMap.set(eTag, event);
        }
      }
      for (const eventId of eventIds) {
        results.set(eventId, reactionMap.get(eventId));
      }
    } catch {
      for (const eventId of eventIds) {
        results.set(eventId, undefined);
      }
    }
    return results;
  }

  private async executeDTagBatch(
    kind: number,
    author: string,
    dTags: string[],
    signal: AbortSignal,
  ): Promise<Map<string, NostrEvent | undefined>> {
    const results = new Map<string, NostrEvent | undefined>();
    try {
      const events = await this.pool.query(
        [{ kinds: [kind], authors: [author], '#d': dTags, limit: dTags.length }],
        { signal },
      );
      const byDTag = new Map<string, NostrEvent>();
      for (const event of events) {
        const d = event.tags.find(([name]) => name === 'd')?.[1];
        if (!d) continue;
        const existing = byDTag.get(d);
        if (!existing || event.created_at > existing.created_at) {
          byDTag.set(d, event);
        }
      }
      for (const dTag of dTags) {
        results.set(dTag, byDTag.get(dTag));
      }
    } catch {
      for (const dTag of dTags) {
        results.set(dTag, undefined);
      }
    }
    return results;
  }

  private async executeETagBatch(
    kinds: number[],
    eventIds: string[],
    perEventLimit: number,
    signal: AbortSignal,
  ): Promise<Map<string, NostrEvent[]>> {
    const results = new Map<string, NostrEvent[]>();
    try {
      const events = await this.pool.query(
        [{ kinds, '#e': eventIds, limit: eventIds.length * perEventLimit }],
        { signal },
      );

      // Group results by which event ID they reference via e-tag.
      const byEventId = new Map<string, NostrEvent[]>();
      const eventIdSet = new Set(eventIds);
      for (const event of events) {
        for (const tag of event.tags) {
          if (tag[0] === 'e' && eventIdSet.has(tag[1])) {
            const existing = byEventId.get(tag[1]) ?? [];
            existing.push(event);
            byEventId.set(tag[1], existing);
          }
        }
      }

      for (const eventId of eventIds) {
        results.set(eventId, byEventId.get(eventId) ?? []);
      }
    } catch {
      for (const eventId of eventIds) {
        results.set(eventId, []);
      }
    }
    return results;
  }

  private async executeMultiFilterBatch(
    templateFilters: NostrFilter[],
    eventIds: string[],
    signal: AbortSignal,
  ): Promise<Map<string, NostrEvent[]>> {
    const results = new Map<string, NostrEvent[]>();
    try {
      // Build combined filters by replacing single #e/#q values with the full batch.
      const batchedFilters: NostrFilter[] = templateFilters.map((f) => {
        const clone = { ...f };
        const rec = clone as Record<string, unknown>;
        if (rec['#e'] !== undefined) {
          rec['#e'] = eventIds;
          // Scale up limit proportionally
          if (clone.limit) {
            clone.limit = clone.limit * eventIds.length;
          }
        }
        if (rec['#q'] !== undefined) {
          rec['#q'] = eventIds;
          if (clone.limit) {
            clone.limit = clone.limit * eventIds.length;
          }
        }
        return clone;
      });

      const events = await this.pool.query(batchedFilters, { signal });

      // Group results by which event ID they reference via e-tag or q-tag.
      const byEventId = new Map<string, NostrEvent[]>();
      const eventIdSet = new Set(eventIds);

      for (const event of events) {
        const matchedIds = new Set<string>();
        for (const tag of event.tags) {
          if ((tag[0] === 'e' || tag[0] === 'q') && eventIdSet.has(tag[1])) {
            matchedIds.add(tag[1]);
          }
        }
        for (const id of matchedIds) {
          const existing = byEventId.get(id) ?? [];
          existing.push(event);
          byEventId.set(id, existing);
        }
      }

      for (const eventId of eventIds) {
        results.set(eventId, byEventId.get(eventId) ?? []);
      }
    } catch {
      for (const eventId of eventIds) {
        results.set(eventId, []);
      }
    }
    return results;
  }
}
