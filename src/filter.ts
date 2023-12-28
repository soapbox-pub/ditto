import { Conf } from '@/config.ts';
import { type Event, type Filter, matchFilters, stringifyStable, z } from '@/deps.ts';
import { nostrIdSchema } from '@/schemas/nostr.ts';
import { type EventData } from '@/types.ts';

/** Additional properties that may be added by Ditto to events. */
type Relation = 'author' | 'author_stats' | 'event_stats';

/** Custom filter interface that extends Nostr filters with extra options for Ditto. */
interface DittoFilter<K extends number = number> extends Filter<K> {
  /** Whether the event was authored by a local user. */
  local?: boolean;
  /** Additional fields to add to the returned event. */
  relations?: Relation[];
}

/** Filter to get one specific event. */
type MicroFilter = { ids: [Event['id']] } | { kinds: [0]; authors: [Event['pubkey']] };

/** Additional options to apply to the whole subscription. */
interface GetFiltersOpts {
  /** Signal to abort the request. */
  signal?: AbortSignal;
  /** Event limit for the whole subscription. */
  limit?: number;
  /** Relays to use, if applicable. */
  relays?: WebSocket['url'][];
}

function matchDittoFilter(filter: DittoFilter, event: Event, data: EventData): boolean {
  if (filter.local && !(data.user || event.pubkey === Conf.pubkey)) {
    return false;
  }

  return matchFilters([filter], event);
}

/**
 * Similar to nostr-tools `matchFilters`, but supports Ditto's custom keys.
 * Database calls are needed to look up the extra data, so it's passed in as an argument.
 */
function matchDittoFilters(filters: DittoFilter[], event: Event, data: EventData): boolean {
  for (const filter of filters) {
    if (matchDittoFilter(filter, event, data)) {
      return true;
    }
  }

  return false;
}

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
function eventToMicroFilter(event: Event): MicroFilter {
  const [microfilter] = getMicroFilters(event);
  return microfilter;
}

/** Get all the microfilters for an event, in order of priority. */
function getMicroFilters(event: Event): MicroFilter[] {
  const microfilters: MicroFilter[] = [];
  if (event.kind === 0) {
    microfilters.push({ kinds: [0], authors: [event.pubkey] });
  }
  microfilters.push({ ids: [event.id] });
  return microfilters;
}

/** Microfilter schema. */
const microFilterSchema = z.union([
  z.object({ ids: z.tuple([nostrIdSchema]) }).strict(),
  z.object({ kinds: z.tuple([z.literal(0)]), authors: z.tuple([nostrIdSchema]) }).strict(),
]);

/** Checks whether the filter is a microfilter. */
function isMicrofilter(filter: Filter): filter is MicroFilter {
  return microFilterSchema.safeParse(filter).success;
}

export {
  type DittoFilter,
  eventToMicroFilter,
  getFilterId,
  type GetFiltersOpts,
  getMicroFilters,
  isMicrofilter,
  matchDittoFilters,
  type MicroFilter,
  type Relation,
};
