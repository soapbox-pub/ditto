import React, { useEffect, useRef } from 'react';
import { NostrEvent, NostrFilter, NPool, NRelay1, NSet } from '@nostrify/nostrify';
import type { NRelay } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';

/** Grace period (ms) given to remaining relays after the first EOSE. */
const EOSE_GRACE_MS = 1500;

/**
 * Wraps an NPool so that `query()` races individual relays:
 *  - Sends the request to every read relay simultaneously.
 *  - As soon as the first relay finishes (EOSE), starts a short grace timer.
 *  - When the timer fires (or all relays finish), merges + deduplicates results and returns.
 *  - Callers still get events from *all* relays that responded in time.
 */
class RacingPool implements NRelay {
  constructor(private pool: NPool, private getReadRelays: () => string[]) {}

  /** Publish — delegates straight to the pool (fans out to all write relays). */
  event(event: NostrEvent, opts?: { signal?: AbortSignal }) {
    return this.pool.event(event, opts);
  }

  /** Subscribe — delegates to pool (keeps original all-relay-EOSE behaviour). */
  req(filters: NostrFilter[], opts?: { signal?: AbortSignal }) {
    return this.pool.req(filters, opts);
  }

  /** Query with first-EOSE racing. */
  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const relayUrls = this.getReadRelays();

    // 0-1 relays: no racing needed
    if (relayUrls.length <= 1) {
      return this.pool.query(filters, opts);
    }

    const controller = new AbortController();
    const outerSignal = opts?.signal;

    // If the caller aborts, propagate to our internal controller
    if (outerSignal) {
      if (outerSignal.aborted) {
        controller.abort();
      } else {
        outerSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    const allEvents = new NSet();
    let firstEoseFired = false;
    let graceTimeout: ReturnType<typeof setTimeout> | undefined;
    let resolved = false;

    return new Promise<NostrEvent[]>((resolve) => {
      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (graceTimeout) clearTimeout(graceTimeout);
        controller.abort();
        // NSet deduplicates and keeps latest replaceable events
        resolve([...allEvents].sort((a, b) => b.created_at - a.created_at));
      };

      let pending = relayUrls.length;

      for (const url of relayUrls) {
        const relay = this.pool.relay(url);
        relay.query(filters, { signal: controller.signal }).then((events) => {
          if (resolved) return;
          for (const e of events) allEvents.add(e);

          if (!firstEoseFired) {
            firstEoseFired = true;
            // Start grace timer for remaining relays
            graceTimeout = setTimeout(finish, EOSE_GRACE_MS);
          }

          pending--;
          if (pending <= 0) finish();
        }).catch(() => {
          // Relay failed or was aborted — just count it as done
          pending--;
          if (pending <= 0) finish();
        });
      }
    });
  }

  /** Proxy helper methods through to the underlying pool. */
  relay(url: string) { return this.pool.relay(url); }
  group(urls: string[]) { return this.pool.group(urls); }
  close() { return this.pool.close(); }
}

interface NostrProviderProps {
  children: React.ReactNode;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();

  const queryClient = useQueryClient();

  // Create instances only once
  const racingPool = useRef<RacingPool | undefined>(undefined);
  const pool = useRef<NPool | undefined>(undefined);

  // Use refs so the pool always has the latest data
  const relayMetadata = useRef(config.relayMetadata);

  // Invalidate Nostr queries when relay metadata changes
  useEffect(() => {
    relayMetadata.current = config.relayMetadata;
    queryClient.invalidateQueries({ queryKey: ['nostr'] });
  }, [config.relayMetadata, queryClient]);

  // Initialize NPool only once
  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters: NostrFilter[]) {
        const routes = new Map<string, NostrFilter[]>();

        // Route to all read relays
        const readRelays = relayMetadata.current.relays
          .filter(r => r.read)
          .map(r => r.url);

        for (const url of readRelays) {
          routes.set(url, filters);
        }

        return routes;
      },
      eventRouter(_event: NostrEvent) {
        // Publish to all write relays
        const writeRelays = relayMetadata.current.relays
          .filter(r => r.write)
          .map(r => r.url);

        return [...new Set(writeRelays)];
      },
    });

    racingPool.current = new RacingPool(
      pool.current,
      () => relayMetadata.current.relays.filter(r => r.read).map(r => r.url),
    );
  }

  return (
    <NostrContext.Provider value={{ nostr: racingPool.current! }}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;