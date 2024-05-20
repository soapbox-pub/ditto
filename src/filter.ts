import { NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import stringifyStable from 'fast-stable-stringify';
import { getFilterLimit } from 'nostr-tools';
import { z } from 'zod';

/** Microfilter to get one specific event by ID. */
type IdMicrofilter = { ids: [NostrEvent['id']] };
/** Microfilter to get an author. */
type AuthorMicrofilter = { kinds: [0]; authors: [NostrEvent['pubkey']] };
/** Filter to get one specific event. */
type MicroFilter = IdMicrofilter | AuthorMicrofilter;

/** Get deterministic ID for a microfilter. */
function getFilterId(filter: MicroFilter): string {
  if ('ids' in filter) {
    return stringifyStable({ ids: [filter.ids[0]] });
  } else {
    return stringifyStable({
      kinds: [filter.kinds[0]],
      authors: [filter.authors[0]],
    });
  }
}

/** Get a microfilter from a Nostr event. */
function eventToMicroFilter(event: NostrEvent): MicroFilter {
  const [microfilter] = getMicroFilters(event);
  return microfilter;
}

/** Get all the microfilters for an event, in order of priority. */
function getMicroFilters(event: NostrEvent): MicroFilter[] {
  const microfilters: MicroFilter[] = [];
  if (event.kind === 0) {
    microfilters.push({ kinds: [0], authors: [event.pubkey] });
  }
  microfilters.push({ ids: [event.id] });
  return microfilters;
}

/** Microfilter schema. */
const microFilterSchema = z.union([
  z.object({ ids: z.tuple([n.id()]) }).strict(),
  z.object({ kinds: z.tuple([z.literal(0)]), authors: z.tuple([n.id()]) }).strict(),
]);

/** Checks whether the filter is a microfilter. */
function isMicrofilter(filter: NostrFilter): filter is MicroFilter {
  return microFilterSchema.safeParse(filter).success;
}

/** Returns true if the filter could potentially return any stored events at all. */
function canFilter(filter: NostrFilter): boolean {
  return getFilterLimit(filter) > 0;
}

/** Normalize the `limit` of each filter, and remove filters that can't produce any events. */
function normalizeFilters<F extends NostrFilter>(filters: F[]): F[] {
  return filters.reduce<F[]>((acc, filter) => {
    const limit = getFilterLimit(filter);
    if (limit > 0) {
      acc.push(limit === Infinity ? filter : { ...filter, limit });
    }
    return acc;
  }, []);
}

export {
  type AuthorMicrofilter,
  canFilter,
  eventToMicroFilter,
  getFilterId,
  getFilterLimit,
  getMicroFilters,
  type IdMicrofilter,
  isMicrofilter,
  type MicroFilter,
  normalizeFilters,
};
