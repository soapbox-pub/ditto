import { Conf } from '@/config.ts';
import { type Event, type Filter, matchFilters } from '@/deps.ts';

import type { EventData } from '@/types.ts';

/** Additional properties that may be added by Ditto to events. */
type Relation = 'author' | 'author_stats' | 'event_stats';

/** Custom filter interface that extends Nostr filters with extra options for Ditto. */
interface DittoFilter<K extends number = number> extends Filter<K> {
  /** Whether the event was authored by a local user. */
  local?: boolean;
  /** Additional fields to add to the returned event. */
  relations?: Relation[];
}

/** Additional options to apply to the whole subscription. */
interface GetFiltersOpts {
  /** How long to wait (in milliseconds) until aborting the request. */
  timeout?: number;
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

export { type DittoFilter, type GetFiltersOpts, matchDittoFilters, type Relation };
