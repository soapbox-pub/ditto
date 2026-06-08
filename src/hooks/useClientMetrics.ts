import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';
import { DITTO_RELAY } from '@/lib/appRelays';

const HOUR = 3600;
const DAY = 86400;
const MONTH = 30 * DAY;

/**
 * The Ditto relay supports `distinct:author` in the NIP-45 COUNT `search`
 * field, which counts unique authors rather than total events.
 */
const DISTINCT_AUTHOR = 'distinct:author';

/** A single point in the unique-users time series. */
export interface UniqueUsersPoint {
  /** Short axis label, e.g. "Jun 7". */
  label: string;
  /** Distinct authors active in this day's bucket. */
  count: number;
}

export interface ClientMetrics {
  /** Monthly Active Users — distinct authors in the last 30 days. */
  mau: number;
  /** Daily distinct-author counts over the last 30 days (oldest → newest). */
  uniqueUsersSeries: UniqueUsersPoint[];
}

/**
 * Snap a unix timestamp to the start of its UTC hour. Snapping keeps query
 * keys stable across re-renders so React Query doesn't refetch every render.
 */
function snapToHour(seconds: number): number {
  return Math.floor(seconds / HOUR) * HOUR;
}

/**
 * Generate daily time buckets for the past N days, snapped to hour boundaries
 * for stable query keys. Returned oldest → newest.
 */
function dailyBuckets(days: number): Array<{ since: number; until: number; label: string }> {
  const now = snapToHour(Math.floor(Date.now() / 1000));
  const buckets: Array<{ since: number; until: number; label: string }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const until = now - i * DAY;
    const since = until - DAY;
    const label = new Date(until * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    buckets.push({ since, until, label });
  }

  return buckets;
}

/**
 * Fetch usage metrics for a NIP-89 client via NIP-45 COUNT queries against the
 * Ditto relay. Mirrors the approach used by the ditto-metrics dashboard, but
 * exposes only the two metrics surfaced on `/client/:name`:
 *
 * - **MAU** — distinct authors who published with this client in the last 30 days.
 * - **Unique Users (30d)** — a daily time series of distinct authors.
 *
 * Accepts one or more `#client` tag values, all OR'd together in the COUNT
 * filter, so a client with multiple tags (e.g. "Primal Web" + "Primal Android")
 * is counted as a single client.
 *
 * Returns `undefined` data (and never throws to the UI) when the relay does not
 * support NIP-45 COUNT or the `distinct:author` search extension.
 */
export function useClientMetrics(clientTags: string[]) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['client-metrics', clientTags],
    queryFn: async (c): Promise<ClientMetrics> => {
      const relay = nostr.relay(DITTO_RELAY);
      if (!relay.count) {
        throw new Error('Relay does not support NIP-45 COUNT');
      }

      const clientFilter: Partial<NostrFilter> = { '#client': clientTags };
      const now = snapToHour(Math.floor(Date.now() / 1000));
      const buckets = dailyBuckets(30);

      const [mauResult, seriesResults] = await Promise.all([
        relay.count(
          [{ ...clientFilter, search: DISTINCT_AUTHOR, since: now - MONTH, until: now }],
          { signal: c.signal },
        ),
        Promise.all(
          buckets.map((bucket) =>
            relay.count!(
              [{
                ...clientFilter,
                search: DISTINCT_AUTHOR,
                since: bucket.since,
                until: bucket.until,
              }],
              { signal: c.signal },
            ).then((r) => ({ label: bucket.label, count: r.count })),
          ),
        ),
      ]);

      return {
        mau: mauResult.count,
        uniqueUsersSeries: seriesResults,
      };
    },
    enabled: clientTags.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
