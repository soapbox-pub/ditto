import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { NUser, useNostrLogin } from '@nostrify/react/login';
import type { NostrSigner } from '@nostrify/types';
import { useAppContext } from '@/hooks/useAppContext';
import { AndroidNativeSigner } from '@/lib/androidNativeSigner';
import { getEffectiveRelays, DITTO_RELAYS, DIVINE_RELAY, NGIT_RELAY, ZAPSTORE_RELAY } from '@/lib/appRelays';
import { GIT_ACTIVITY_KINDS } from '@/lib/gitActivity';
import { NSITE_KINDS } from '@/lib/nsiteSubdomain';
import { AppPool } from '@/lib/AppPool';
import { EventVerifier } from '@/lib/EventVerifier';
import {
  AuthAwareRelay,
  BlockedRelay,
  DEFAULT_RELAY_AUTH_POLICY,
  isRelayAuthClaimed,
  isRelayBlocked,
  loadBlockedRelays,
  normalizeRelayUrl,
  onBlockedRelaysChange,
  relayMatchKey,
  requestRelayAuth,
  resetRelayAuthSession,
  setUnblockableRelays,
  withoutBlockedRelays,
} from '@/lib/relayPolicy';
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
  const { config, updateConfig } = useAppContext();
  const { logins } = useNostrLogin();

  // Latest config for the pool's callbacks, which are created only once.
  const configRef = useRef(config);
  configRef.current = config;
  const updateConfigRef = useRef(updateConfig);
  updateConfigRef.current = updateConfig;

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

  // One signature-verification cache shared by every relay connection the pool
  // opens. The same event arrives once per read relay, so the cache only pays
  // off if the instance outlives an individual connection.
  const verifier = useRef<EventVerifier | undefined>(undefined);
  verifier.current ??= new EventVerifier();

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
        case 'x-android-signer': {
          // Native Android signer app (Amber, etc.) via NIP-55. Seeded with the
          // login's known pubkey so answering a challenge never triggers a
          // getPublicKey round-trip. NOT wrapped in signerWithNudge — like
          // every other branch here, this is the AUTH-only signer.
          const { packageName } = currentLogin.data as { packageName: string };
          return new AndroidNativeSigner(packageName, currentLogin.pubkey);
        }
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }, [currentLogin]);

  // Keep the ref in sync so the AUTH callback always sees the latest signer.
  signerRef.current = currentSigner;

  // Apply the account's cached blocked relays before any connection is made
  // for it; NostrSync replaces them once the list is fetched. The first load
  // happens during render, before the pool exists. Later account switches are
  // handled in a layout effect, which runs before any child's effects can
  // open a connection. A switch also drops the previous account's
  // session-only AUTH answers and pending prompts.
  const activePubkey = currentLogin?.pubkey;
  if (!pool.current) loadBlockedRelays(activePubkey);
  const loadedPubkeyRef = useRef(activePubkey);
  useLayoutEffect(() => {
    if (loadedPubkeyRef.current === activePubkey) return;
    loadedPubkeyRef.current = activePubkey;
    loadBlockedRelays(activePubkey);
    resetRelayAuthSession();
  }, [activePubkey]);

  // Bunker relays of every login, which the pool also connects to.
  const bunkerRelaysRef = useRef<string[]>([]);
  bunkerRelaysRef.current = logins.flatMap((login) => {
    const relays = login.type === 'bunker' ? (login.data as { relays?: unknown }).relays : undefined;
    return Array.isArray(relays) ? relays.filter((r): r is string => typeof r === 'string') : [];
  });
  // Blocking a remote signer's relay would silently break signing.
  setUnblockableRelays(bunkerRelaysRef.current);

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

  /** Whether `href` is one of `urls`, comparing normalized URLs. */
  const includesRelay = (urls: string[], href: string): boolean =>
    urls.some((url) => normalizeRelayUrl(url) === href);

  /** Relays the user or the app chose, including ones allowed from a prompt. */
  const isChosenRelay = (href: string): boolean => includesRelay([
    ...effectiveRelays.current.relays.map((r) => r.url),
    ...configRef.current.relayMetadata.relays.map((r) => r.url),
    ...(configRef.current.relayAuthAllowed ?? []),
    ...DITTO_RELAYS,
    DIVINE_RELAY,
    NGIT_RELAY,
    ZAPSTORE_RELAY,
  ], href);

  /**
   * Whether to answer a relay's AUTH challenge, which tells it who is
   * connecting. Bunker relays always get it — the remote signer is reached
   * through them — and blocked relays never do.
   */
  const mayAuthenticate = async (href: string, authNeeded: () => Promise<void>): Promise<boolean> => {
    if (isRelayBlocked(href)) return false;
    if (includesRelay(bunkerRelaysRef.current, href)) return true;
    // Relays the user said never to sign in to, from a prompt.
    if (includesRelay(configRef.current.relayAuthDenied ?? [], href)) return false;

    const policy = configRef.current.relayAuthPolicy ?? DEFAULT_RELAY_AUTH_POLICY;
    if (policy === 'always') return true;
    if (policy !== 'never' && isChosenRelay(href)) return true;

    // Relays often challenge on connect without needing it. Only consider
    // asking once the relay refuses a request until the user signs in.
    await authNeeded();

    // Ask when the policy says to, or when the user is on the relay's own
    // page: they went there on purpose, so offer to sign in whatever the
    // policy.
    if (policy !== 'ask' && !isRelayAuthClaimed(href)) return false;

    const { allowed, remember } = await requestRelayAuth(href);
    if (remember) {
      const key = allowed ? 'relayAuthAllowed' : 'relayAuthDenied';
      updateConfigRef.current((current) => ({
        ...current,
        [key]: [...new Set([...(current[key] ?? []), href])],
      }));
    }
    return allowed;
  };

  // Initialize NPool only once
  if (!pool.current) {
    pool.current = new NPool({
      open(relayUrl: string) {
        const url = new URL(relayUrl);
        // Never connect to a relay the user has blocked (NIP-51 kind 10006).
        if (isRelayBlocked(url.href)) {
          return new BlockedRelay(url.href) as unknown as NRelay1;
        }
        const relay: AuthAwareRelay = new AuthAwareRelay(url.href, {
          // Every read relay receives the same REQ, so a popular event is
          // verified once per connection. Cache by id to pay for it once.
          verifyEvent: verifier.current!.verify,
          // NIP-42: Respond to relay AUTH challenges by signing a kind
          // 22242 ephemeral event with the current user's signer.
          //
          // Gated by the user's AUTH policy. The pool also connects to
          // relays named by links and other people's relay lists, and
          // answering a challenge tells the relay who is connecting.
          auth: async (challenge: string) => {
            if (!signerRef.current) {
              throw new Error('AUTH failed: no signer available (user not logged in)');
            }
            if (!(await mayAuthenticate(url.href, () => relay.authNeeded()))) {
              throw new Error('AUTH declined by the relay AUTH policy');
            }
            // Re-read: the user may have logged out while being asked.
            const signer = signerRef.current;
            if (!signer) {
              throw new Error('AUTH failed: no signer available (user not logged in)');
            }
            return signer.signEvent({
              kind: 22242,
              content: '',
              tags: [
                ['relay', url.href],
                // A challenge may have been replaced while the user was asked.
                ['challenge', relay.currentChallenge ?? challenge],
              ],
              created_at: Math.floor(Date.now() / 1000),
            });
          },
        });
        return relay;
      },
      reqRouter(filters: NostrFilter[]): Map<URL['href'], NostrFilter[]> {
        const routes = new Map<string, NostrFilter[]>();

        // Search queries must go to search relays
        if (filters.some((f) => "search" in f)) {
          return new Map(withoutBlockedRelays(DITTO_RELAYS).map(url => [url, filters]));
        }

        // Include divine relay for kind 34236 queries, which are addressable short videos
        if (filters.every((f) => f?.kinds?.length === 1 && f?.kinds[0] === 34236)) {
          return new Map(withoutBlockedRelays([...DITTO_RELAYS, DIVINE_RELAY]).map(url => [url, filters]));
        }

        // Route to all read relays
        const readRelays = withoutBlockedRelays(effectiveRelays.current.relays
          .filter(r => r.read)
          .map(r => r.url));

        // Development kinds live on specialized relays the user's read
        // relays rarely carry: Zapstore kinds (apps/releases/assets) on the
        // Zapstore relay and NIP-34 git kinds on the ngit relay. When a
        // query asks *only* for development kinds (e.g. the /development
        // feed or a git root-event lookup), fan out to the matching special
        // relays in addition to the read relays. Mixed feeds that include
        // kind 1 etc. never match, so ordinary traffic doesn't hit them.
        const ZAPSTORE_KINDS = [32267, 30063, 3063];
        const DEV_KINDS = [...ZAPSTORE_KINDS, ...GIT_ACTIVITY_KINDS, 30817, ...NSITE_KINDS, 31990];
        if (filters.every((f) => f?.kinds?.length && f.kinds.every((k) => DEV_KINDS.includes(k)))) {
          const urls = new Set<string>();
          if (filters.some((f) => f.kinds?.some((k) => ZAPSTORE_KINDS.includes(k)))) urls.add(ZAPSTORE_RELAY);
          if (filters.some((f) => f.kinds?.some((k) => GIT_ACTIVITY_KINDS.includes(k)))) urls.add(NGIT_RELAY);
          for (const url of readRelays) urls.add(url);
          return new Map(withoutBlockedRelays([...urls]).map((url) => [url, filters]));
        }

        for (const url of readRelays) {
          routes.set(url, filters);
        }

        return routes;
      },
      eventRouter(_event: NostrEvent) {
        // Get write relays from effective relays
        const writeRelays = withoutBlockedRelays(effectiveRelays.current.relays
          .filter(r => r.write)
          .map(r => r.url));

        const allRelays = new Set<string>(writeRelays);

        return [...allRelays];
      },
      // Resolve queries quickly once any relay sends EOSE, instead of
      // waiting for every relay to finish.
      eoseTimeout: 300,
    });
  }

  // The pool caches a relay per URL for the whole session, so blocking only
  // takes effect for relays not yet opened. When the blocked set changes,
  // close and forget the affected relays: a newly blocked relay's live
  // connection ends, and an unblocked one is reopened for real on next use.
  // Pool keys are the URLs as callers wrote them, so compare match keys.
  useEffect(() => {
    return onBlockedRelaysChange((changed) => {
      // NPool only exposes its relay map read-only; it is a Map at runtime.
      const relays = pool.current?.relays as Map<string, NRelay1> | undefined;
      if (!relays) return;
      for (const [key, relay] of [...relays]) {
        const matchKey = relayMatchKey(key);
        if (matchKey && changed.includes(matchKey)) {
          relays.delete(key);
          void relay.close();
        }
      }
    });
  }, []);

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
