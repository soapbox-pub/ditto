import { Conf } from '@/config.ts';
import { type Event, type Filter, matchFilters } from '@/deps.ts';

import type { EventData } from '@/types.ts';

/** Custom filter interface that extends Nostr filters with extra options for Ditto. */
interface DittoFilter<K extends number = number> extends Filter<K> {
  local?: boolean;
}

/** Additional properties that may be added to events. */
type With = 'authors';

/** Additional options to apply to the whole subscription. */
interface GetFiltersOpts {
  /** How long to wait (in milliseconds) until aborting the request. */
  timeout?: number;
  /** Event limit for the whole subscription. */
  limit?: number;
  /** Whether to include a corresponding kind 0 event in the `authors` key of each event. */
  with?: With[];
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

export { type DittoFilter, type GetFiltersOpts, matchDittoFilters };
