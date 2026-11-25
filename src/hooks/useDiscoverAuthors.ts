import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useAppContext } from './useAppContext';
import { useCurrentUser } from './useCurrentUser';
import { useDiscoverCurators } from './useDiscoverCurators';
import { useFollowList } from './useFollowActions';
import { useMutedAuthorFilter } from './useMutedAuthorFilter';
import { useNostrStorage } from './useNostrStorage';
import { curatorsKey, type DiscoverCurator } from '@/lib/discoverCurators';
import { fetchDiscoverNetwork } from '@/lib/discoverNetwork';
import { getStorageKey } from '@/lib/storageKey';

/** How long a computed network is used before it's rebuilt. */
const NETWORK_TTL = 24 * 60 * 60 * 1000;

const NO_AUTHORS: string[] = [];

interface CachedNetwork {
  seed: string;
  updatedAt: number;
  /** Pubkeys concatenated without a separator (each is 64 hex chars). */
  authors: string;
}

function readCachedNetwork(key: string, seed: string): CachedNetwork | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as CachedNetwork;
    return cached.seed === seed && typeof cached.authors === 'string' ? cached : undefined;
  } catch {
    return undefined;
  }
}

function splitAuthors(authors: string): string[] {
  const result: string[] = [];
  for (let i = 0; i + 64 <= authors.length; i += 64) result.push(authors.slice(i, i + 64));
  return result;
}

interface NetworkQueryOptions {
  /** What the network is built from, as a cache key; `undefined` disables the query. */
  seed: string | undefined;
  sources: DiscoverCurator[];
  excludeDirect: boolean;
  /** localStorage name the newest network is kept under. */
  storageName: string;
  enabled: boolean;
}

/**
 * Build a friends-of-friends network (see `fetchDiscoverNetwork`). Building one
 * downloads hundreds of contact lists, so the result is kept in localStorage
 * and rebuilt at most once a day.
 */
function useNetworkQuery({ seed, sources, excludeDirect, storageName, enabled }: NetworkQueryOptions) {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const { config } = useAppContext();
  const storageKey = getStorageKey(config.appId, storageName);

  return useQuery<string[]>({
    queryKey: ['discover-network', seed ?? ''],
    queryFn: async ({ signal }) => {
      const authors = await fetchDiscoverNetwork(nostr, store, sources, signal, { excludeDirect });
      try {
        const cached: CachedNetwork = { seed: seed!, updatedAt: Date.now(), authors: authors.join('') };
        localStorage.setItem(storageKey, JSON.stringify(cached));
      } catch {
        // Quota exceeded; the in-memory copy still works.
      }
      return authors;
    },
    initialData: () => {
      const cached = seed ? readCachedNetwork(storageKey, seed) : undefined;
      return cached ? splitAuthors(cached.authors) : undefined;
    },
    initialDataUpdatedAt: () => (seed ? readCachedNetwork(storageKey, seed)?.updatedAt : undefined),
    enabled: enabled && !!seed,
    staleTime: NETWORK_TTL,
    gcTime: Infinity,
    retry: 2,
  });
}

/**
 * The curators' friends-of-friends network (`useDiscoverCurators`): the
 * curators, everyone they pick, and everyone those people follow, up to 5000
 * pubkeys ranked by how many people in the network follow them (see
 * `rankDiscoverNetwork`). Feeds the Ditto feed, and Discover for anyone
 * without follows of their own.
 *
 * @returns `authors` (`undefined` while loading, empty with no curators or
 *   when the network can't be built), whether building it failed, and a `key`
 *   that changes whenever `authors` does, for query keys.
 */
export function useCuratorNetwork(enabled = true): { authors: string[] | undefined; isError: boolean; key: string } {
  const curators = useDiscoverCurators();
  const seed = curatorsKey(curators) || undefined;

  const { data, dataUpdatedAt, isError } = useNetworkQuery({
    seed,
    sources: curators,
    excludeDirect: false,
    storageName: 'curatorNetwork',
    enabled,
  });

  // Settle on an empty network so feeds show their empty state (with a
  // retry) instead of loading forever.
  const authors = !seed || isError ? data ?? NO_AUTHORS : data;
  return { authors, isError, key: `${seed ?? ''}:${dataUpdatedAt}` };
}

/**
 * The authors behind every Discover tab: a friends-of-friends network of up to
 * 5000 pubkeys, ranked by how many people in the network follow them (see
 * `rankDiscoverNetwork`).
 *
 * Logged in, the network is the user's own, minus the user and everyone they
 * follow, so Discover never repeats the Follows tab. Logged out, or when the
 * user follows nobody yet, it's the curators' ({@link useCuratorNetwork}).
 *
 * Pass `enabled: false` on pages that render the hook without showing
 * Discover, so the download only happens for people who actually look at it.
 *
 * @returns `authors` minus muted pubkeys (`undefined` while loading), and a
 *   `key` that changes whenever `authors` does, for query keys.
 */
export function useDiscoverAuthors(enabled = true): { authors: string[] | undefined; key: string } {
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const { excludeMuted, mutedKey } = useMutedAuthorFilter();

  const ownNetwork = !!user && !!followData && followData.pubkeys.length > 0;
  const waitingForFollows = !!user && followData === undefined;
  const userPubkey = user?.pubkey;

  const sources = useMemo<DiscoverCurator[]>(
    () => (userPubkey ? [{ type: 'follows', pubkey: userPubkey }] : []),
    [userPubkey],
  );
  const own = useNetworkQuery({
    seed: ownNetwork ? userPubkey : undefined,
    sources,
    excludeDirect: true,
    storageName: 'discoverNetwork',
    enabled,
  });
  const curated = useCuratorNetwork(enabled && !ownNetwork && !waitingForFollows);

  const network = ownNetwork ? (own.isError ? own.data ?? NO_AUTHORS : own.data) : curated.authors;
  const authors = useMemo(() => {
    if (waitingForFollows || !network) return undefined;
    // The network is rebuilt daily; drop anyone followed since, and the
    // user, against the live follow list.
    const direct = new Set(followData?.pubkeys);
    if (userPubkey) direct.add(userPubkey);
    return excludeMuted(network).filter((pk) => !direct.has(pk));
  }, [waitingForFollows, network, excludeMuted, followData?.pubkeys, userPubkey]);

  const key = ownNetwork ? `${userPubkey}:${own.dataUpdatedAt}` : curated.key;
  return { authors, key: `${key}:${mutedKey}:${followData?.event?.id ?? ''}` };
}
