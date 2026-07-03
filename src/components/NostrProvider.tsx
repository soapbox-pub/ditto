import React, { useEffect, useMemo, useRef } from 'react';
import { NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { NUser, useNostrLogin } from '@nostrify/react/login';
import type { NostrSigner } from '@nostrify/types';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays, DITTO_RELAYS, DIVINE_RELAY, NGIT_RELAY, ZAPSTORE_RELAY } from '@/lib/appRelays';
import { GIT_ACTIVITY_KINDS } from '@/lib/gitActivity';
import { AppPool } from '@/lib/AppPool';
import { NIndexedDB } from '@nostrify/indexeddb';
import { NostrStorageContext } from '@/contexts/NostrStorageContext';

/**
 * IndexedDB database name for the events cache.
 *
 * `@nostrify/indexeddb` installs its own schema at version 1, while the old
 * in-tree `NIndexedDB` used the `ditto-events` database at version 2. Opening
 * an existing database at a *lower* version throws, which the package catches
 * and degrades to a permanent no-op. To avoid that, the package-backed cache
 * lives under a fresh name; the old `ditto-events` database is a disposable
 * cache (everything re-fetches from relays) and is deleted on startup.
 */
const EVENTS_DB_NAME = 'nostr';

/** Best-effort deletion of the abandoned legacy events cache database. */
function deleteLegacyEventsDB(): void {
  try {
    indexedDB?.deleteDatabase('ditto-events');
  } catch {
    // Ignore — the legacy database is disposable.
  }
}

interface NostrProviderProps {
  children: React.ReactNode;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();
  const { logins } = useNostrLogin();

  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Open the IndexedDB event store once. It's shared two ways: the AppPool
  // writes every relay result into it (cache-first reads elsewhere), and it's
  // provided through NostrStorageContext so hooks can read it directly. Opening
  // it here lets the AppPool and
  // the rest of the app share a single connection. The cache is append-only;
  // it is never automatically pruned.
  const eventStore = useRef<NIndexedDB | undefined>(undefined);
  eventStore.current ??= new NIndexedDB(EVENTS_DB_NAME);


  // Use refs so the pool always has the latest data
  const effectiveRelays = useRef(getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays));

  // Stable ref to the current user's signer for NIP-42 AUTH.
  // The `open()` callback reads from this ref when a relay sends an AUTH
  // challenge, so it always uses the latest signer without recreating the pool.
  const signerRef = useRef<NostrSigner | undefined>(undefined);

  // Derive the current signer from the active login. This mirrors the
  // logic in useCurrentUser but avoids a circular dependency (useCurrentUser
  // depends on NostrContext which we are providing here).
  const currentLogin = logins[0];
  const currentSigner = useMemo(() => {
    if (!currentLogin) return undefined;
    try {
      switch (currentLogin.type) {
        case 'nsec':
          return NUser.fromNsecLogin(currentLogin).signer;
        case 'bunker':
          // pool.current is guaranteed to exist here: the pool is created
          // synchronously during the first render (below), and useMemo runs
          // after the render body has executed.
          return NUser.fromBunkerLogin(currentLogin, pool.current!).signer;
        case 'extension':
          return NUser.fromExtensionLogin(currentLogin).signer;
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }, [currentLogin]);

  // Keep the ref in sync so the AUTH callback always sees the latest signer.
  signerRef.current = currentSigner;

  // Update effective relays ref when config changes. The NPool reads from
  // this ref, so new queries automatically use the updated relay set.
  //
  // We intentionally do NOT invalidate existing queries here. When relays
  // are added (e.g. NIP-65 sync merging user relays with app defaults),
  // existing cached data is still valid — we'll just query more relays on
  // the next natural refetch. Blanket invalidation caused a disruptive
  // full-feed rerender ~3s after page load when NostrSync synced relays.
  useEffect(() => {
    effectiveRelays.current = getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays);
  }, [config.relayMetadata, config.useAppRelays, config.useUserRelays]);

  // Initialize NPool only once
  if (!pool.current) {
    pool.current = new NPool({
      open(relayUrl: string) {
        const url = new URL(relayUrl);
        return new NRelay1(url.href, {
          // NIP-42: Respond to relay AUTH challenges by signing a kind
          // 22242 ephemeral event with the current user's signer.
          auth: async (challenge: string) => {
            const signer = signerRef.current;
            if (!signer) {
              throw new Error('AUTH failed: no signer available (user not logged in)');
            }
            return signer.signEvent({
              kind: 22242,
              content: '',
              tags: [
                ['relay', url.href],
                ['challenge', challenge],
              ],
              created_at: Math.floor(Date.now() / 1000),
            });
          },
        });
      },
      reqRouter(filters: NostrFilter[]): Map<URL['href'], NostrFilter[]> {
        const routes = new Map<string, NostrFilter[]>();

        // Search queries must go to search relays
        if (filters.some((f) => "search" in f)) {
          return new Map(DITTO_RELAYS.map(url => [url, filters]));
        }

        // Include divine relay for kind 34236 queries, which are addressable short videos
        if (filters.every((f) => f?.kinds?.length === 1 && f?.kinds[0] === 34236)) {
          return new Map([...DITTO_RELAYS, DIVINE_RELAY].map(url => [url, filters]));
        }

        // Route to all read relays
        const readRelays = effectiveRelays.current.relays
          .filter(r => r.read)
          .map(r => r.url);

        // Development kinds live on specialized relays the user's read
        // relays rarely carry: Zapstore kinds (apps/releases/assets) on the
        // Zapstore relay and NIP-34 git kinds on the ngit relay. When a
        // query asks *only* for development kinds (e.g. the /development
        // feed or a git root-event lookup), fan out to the matching special
        // relays in addition to the read relays. Mixed feeds that include
        // kind 1 etc. never match, so ordinary traffic doesn't hit them.
        const ZAPSTORE_KINDS = [32267, 30063, 3063];
        const DEV_KINDS = [...ZAPSTORE_KINDS, ...GIT_ACTIVITY_KINDS, 30817, 15128, 35128, 31990];
        if (filters.every((f) => f?.kinds?.length && f.kinds.every((k) => DEV_KINDS.includes(k)))) {
          const urls = new Set<string>();
          if (filters.some((f) => f.kinds?.some((k) => ZAPSTORE_KINDS.includes(k)))) urls.add(ZAPSTORE_RELAY);
          if (filters.some((f) => f.kinds?.some((k) => GIT_ACTIVITY_KINDS.includes(k)))) urls.add(NGIT_RELAY);
          for (const url of readRelays) urls.add(url);
          return new Map([...urls].map((url) => [url, filters]));
        }

        for (const url of readRelays) {
          routes.set(url, filters);
        }

        return routes;
      },
      eventRouter(_event: NostrEvent) {
        // Get write relays from effective relays
        const writeRelays = effectiveRelays.current.relays
          .filter(r => r.write)
          .map(r => r.url);

        const allRelays = new Set<string>(writeRelays);

        return [...allRelays];
      },
      // Resolve queries quickly once any relay sends EOSE, instead of
      // waiting for every relay to finish.
      eoseTimeout: 300,
    });
  }

  // Wrap the pool in our app-specific AppPool. It has the same interface as
  // NPool but layers on local caching and transparent request batching:
  // `.query()` calls are intercepted to automatically combine batchable filter
  // patterns (profiles, events by ID, reactions, d-tag lookups) into single
  // REQs, and results are mirrored into the local cache. All other methods pass
  // through directly to the underlying pool.
  const appPool = useRef<AppPool | undefined>(undefined);
  if (!appPool.current && pool.current) {
    appPool.current = new AppPool(pool.current, eventStore.current);
    appPool.current.setLoggedInPubkeys(logins.map((l) => l.pubkey));
  }

  // Keep the AppPool's notion of "who is logged in" current. It uses this to
  // decide which events are worth caching: everything from a logged-in account,
  // plus replaceable events from people those accounts follow.
  useEffect(() => {
    appPool.current?.setLoggedInPubkeys(logins.map((l) => l.pubkey));
  }, [logins]);

  // Cleanup: Close all relay connections when the provider unmounts
  useEffect(() => {
    return () => {
      if (pool.current) {
        pool.current.close();
      }
    };
  }, []);

  // Drop the abandoned legacy events cache database (replaced by the
  // package-backed store under a new name). Best-effort, runs once.
  useEffect(() => {
    deleteLegacyEventsDB();
  }, []);

  // Provide the AppPool as the `nostr` object. It has the same interface
  // as NPool, so hooks using `useNostr()` get transparent caching and batching.
  // The `as unknown as NPool` cast is safe because AppPool exposes
  // all the same methods hooks use: query, event, req, relay, group, close.
  return (
    <NostrContext.Provider value={{ nostr: (appPool.current ?? pool.current) as unknown as NPool }}>
      <NostrStorageContext.Provider value={eventStore.current}>
        {children}
      </NostrStorageContext.Provider>
    </NostrContext.Provider>
  );
};

export default NostrProvider;
