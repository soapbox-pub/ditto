import { matchFilters } from '@/deps.ts';

import { getFilters as getFiltersClient } from '@/client.ts';
import { getFilters as getFiltersDB } from '@/db/events.ts';
import { eventDateComparator } from '@/utils.ts';

import type { SignedEvent } from '@/event.ts';
import type { DittoFilter, GetFiltersOpts } from '@/types.ts';

/** Get filters from the database and pool, and mix the best results together. */
async function getFilters<K extends number>(
  filters: DittoFilter<K>[],
  opts?: GetFiltersOpts,
): Promise<SignedEvent<K>[]> {
  const results = await Promise.allSettled([
    getFiltersClient(filters, opts),
    getFiltersDB(filters, opts),
  ]);

  const events = results
    .filter((result): result is PromiseFulfilledResult<SignedEvent<K>[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value);

  return unmixEvents(events, filters);
}

/** Combine and sort events to match the filters. */
function unmixEvents<K extends number>(events: SignedEvent<K>[], filters: DittoFilter<K>[]): SignedEvent<K>[] {
  events = dedupeEvents(events);
  events = takeNewestEvents(events);
  events = events.filter((event) => matchFilters(filters, event));
  events.sort(eventDateComparator);

  return events;
}

/** Deduplicate events by ID. */
function dedupeEvents<K extends number>(events: SignedEvent<K>[]): SignedEvent<K>[] {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

/** Take the newest events among replaceable ones. */
function takeNewestEvents<K extends number>(events: SignedEvent<K>[]): SignedEvent<K>[] {
  const isReplaceable = (kind: number) =>
    kind === 0 || kind === 3 || (10000 <= kind && kind < 20000) || (30000 <= kind && kind < 40000);

  // Group events by author and kind.
  const groupedEvents = events.reduce<Map<string, SignedEvent<K>[]>>((acc, event) => {
    const key = `${event.pubkey}:${event.kind}`;
    const group = acc.get(key) || [];
    acc.set(key, [...group, event]);
    return acc;
  }, new Map());

  // Process each group.
  const processedEvents = Array.from(groupedEvents.values()).flatMap((group) => {
    if (isReplaceable(group[0].kind)) {
      // Sort by `created_at` and take the latest event.
      return group.sort(eventDateComparator)[0];
    }
    return group;
  });

  return processedEvents;
}

export { getFilters };
