import type { NostrFilter } from '@nostrify/nostrify';
import { DITTO_RELAYS, DIVINE_RELAY, NGIT_RELAY, ZAPSTORE_RELAY } from '@/lib/appRelays';
import { GIT_ACTIVITY_KINDS } from '@/lib/gitActivity';
import { NSITE_KINDS } from '@/lib/nsiteSubdomain';

const ZAPSTORE_KINDS = [32267, 30063, 3063];
const DEV_KINDS = [...ZAPSTORE_KINDS, ...GIT_ACTIVITY_KINDS, 30817, ...NSITE_KINDS, 31990];

/**
 * The relays a REQ for `filters` goes to, given the user's read relays.
 * Blocked relays are not removed here; callers filter them out.
 */
export function routeReadRelays(filters: NostrFilter[], readRelays: string[]): string[] {
  // Search queries must go to search relays
  if (filters.some((f) => 'search' in f)) {
    return DITTO_RELAYS;
  }

  // Include divine relay for kind 34236 queries, which are addressable short videos
  if (filters.every((f) => f?.kinds?.length === 1 && f?.kinds[0] === 34236)) {
    return [...DITTO_RELAYS, DIVINE_RELAY];
  }

  // Development kinds live on specialized relays the user's read
  // relays rarely carry: Zapstore kinds (apps/releases/assets) on the
  // Zapstore relay and NIP-34 git kinds on the ngit relay. When a
  // query asks *only* for development kinds (e.g. the /development
  // feed or a git root-event lookup), fan out to the matching special
  // relays in addition to the read relays. Mixed feeds that include
  // kind 1 etc. never match, so ordinary traffic doesn't hit them.
  if (filters.every((f) => f?.kinds?.length && f.kinds.every((k) => DEV_KINDS.includes(k)))) {
    const urls = new Set<string>();
    if (filters.some((f) => f.kinds?.some((k) => ZAPSTORE_KINDS.includes(k)))) urls.add(ZAPSTORE_RELAY);
    if (filters.some((f) => f.kinds?.some((k) => GIT_ACTIVITY_KINDS.includes(k)))) urls.add(NGIT_RELAY);
    for (const url of readRelays) urls.add(url);
    return [...urls];
  }

  // Route to all read relays
  return readRelays;
}
