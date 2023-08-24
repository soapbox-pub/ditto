import { type Event, matchFilters } from '@/deps.ts';

import type { DittoFilter, EventData } from '@/types.ts';

function matchDittoFilter(filter: DittoFilter, event: Event, data: EventData): boolean {
  if (filter.local && !data.user) {
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

export { matchDittoFilters };
