import { NKinds, type NostrEvent, type NostrFilter, type NStore } from '@nostrify/nostrify';
import { matchFilters } from 'nostr-tools/filter';

/**
 * Reconcile relay results with what the logged-in accounts have published
 * from this device, which the local store has (see `AppPool.event`) before
 * any relay may have indexed it.
 *
 * Right after a publish, a refetch races the relay's write→read indexing: it
 * can return the previous version of a list, a reaction that was just undone,
 * or nothing at all, and its result replaces the optimistic UI. Two fixes:
 *
 * - **Deletions.** Own events targeted by a kind 5 in the store are dropped.
 * - **Own lookups.** For filters that only ask about the accounts' own
 *   replaceable / addressable events, or their own events tagging something
 *   (`#e`, `#a`, `#q` — "did I react to / repost this"), the store's matches
 *   are merged in, and the newest version of each replaceable event wins.
 *
 * Feed-style filters (own posts by time) aren't merged: adding store events
 * to a time-paged result would move its pagination cursor.
 *
 * `recent` holds events published in the last few seconds, which the store
 * may not have written yet (it batches writes on idle).
 *
 * Best-effort: on any store failure the relay events are returned unchanged.
 */
export async function reconcileOwnEvents(
  store: NStore,
  own: ReadonlySet<string>,
  recent: NostrEvent[],
  filters: NostrFilter[],
  events: NostrEvent[],
): Promise<NostrEvent[]> {
  if (own.size === 0) return events;

  try {
    const lookups = filters.filter((filter) => isOwnLookup(filter, own));
    const local = lookups.length > 0
      ? [...await store.query(lookups), ...recent.filter((event) => matchFilters(lookups, event))]
      : [];

    const merged = local.length > 0 ? mergeNewest(events, local) : events;
    return await dropDeleted(store, own, recent, merged);
  } catch {
    return events;
  }
}

/** Whether `filter` asks only for the given accounts' own replaceable events or tag lookups. */
function isOwnLookup(filter: NostrFilter, own: ReadonlySet<string>): boolean {
  if (!filter.authors?.length || !filter.authors.every((pk) => own.has(pk))) return false;
  if (filter.search || filter.ids) return false;
  if (filter['#e'] || filter['#a'] || filter['#q']) return true;
  return !!filter.kinds?.length && filter.kinds.every((k) => NKinds.replaceable(k) || NKinds.addressable(k));
}

/** The replaceable coordinate of an event, or its id for regular events. */
function coordinate(event: NostrEvent): string {
  if (NKinds.replaceable(event.kind)) return `${event.kind}:${event.pubkey}`;
  if (NKinds.addressable(event.kind)) {
    const d = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
    return `${event.kind}:${event.pubkey}:${d}`;
  }
  return event.id;
}

/** Merge two event lists, keeping the newest version of each replaceable event, newest first. */
function mergeNewest(a: NostrEvent[], b: NostrEvent[]): NostrEvent[] {
  const byCoord = new Map<string, NostrEvent>();
  for (const event of [...a, ...b]) {
    const key = coordinate(event);
    const existing = byCoord.get(key);
    if (!existing || event.created_at > existing.created_at) byCoord.set(key, event);
  }
  return [...byCoord.values()].sort((x, y) => y.created_at - x.created_at);
}

/** Drop own events that a stored kind 5 from the same account asks to delete. */
async function dropDeleted(
  store: NStore,
  own: ReadonlySet<string>,
  recent: NostrEvent[],
  events: NostrEvent[],
): Promise<NostrEvent[]> {
  const targets = events.filter((event) => own.has(event.pubkey) && event.kind !== 5);
  if (targets.length === 0) return events;

  const ids = targets.map((event) => event.id);
  const addrs = targets.filter((event) => NKinds.addressable(event.kind)).map(coordinate);
  const authors = [...new Set(targets.map((event) => event.pubkey))];

  const filters: NostrFilter[] = [{ kinds: [5], authors, '#e': ids }];
  if (addrs.length > 0) filters.push({ kinds: [5], authors, '#a': addrs });
  const deletions = [
    ...await store.query(filters),
    ...recent.filter((event) => matchFilters(filters, event)),
  ];
  if (deletions.length === 0) return events;

  const deletedIds = new Set<string>();
  /** Coordinate → newest deletion time. Only versions at or before it are deleted (NIP-09). */
  const deletedAddrs = new Map<string, number>();
  for (const deletion of deletions) {
    for (const [name, value] of deletion.tags) {
      if (name === 'e') deletedIds.add(`${deletion.pubkey}:${value}`);
      if (name === 'a' && value.split(':')[1] === deletion.pubkey) {
        deletedAddrs.set(value, Math.max(deletedAddrs.get(value) ?? 0, deletion.created_at));
      }
    }
  }

  return events.filter((event) => {
    if (!own.has(event.pubkey)) return true;
    if (deletedIds.has(`${event.pubkey}:${event.id}`)) return false;
    const deletedAt = NKinds.addressable(event.kind) ? deletedAddrs.get(coordinate(event)) : undefined;
    return deletedAt === undefined || event.created_at > deletedAt;
  });
}
