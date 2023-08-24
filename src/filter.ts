import { type Event, matchFilters } from '@/deps.ts';

import type { DittoFilter } from '@/types.ts';

interface EventData {
  isLocal: boolean;
}

function matchDittoFilter(filter: DittoFilter, event: Event, data: EventData): boolean {
  if (filter.local && !data.isLocal) {
    return false;
  }

  return matchFilters([filter], event);
}

function matchDittoFilters(filters: DittoFilter[], event: Event, data: EventData): boolean {
  for (const filter of filters) {
    if (matchDittoFilter(filter, event, data)) {
      return true;
    }
  }

  return false;
}

export { matchDittoFilters };
