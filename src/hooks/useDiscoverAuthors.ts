import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useAppContext } from './useAppContext';
import { useCurrentUser } from './useCurrentUser';
import { useFollowList } from './useFollowActions';
import { useMutedAuthorFilter } from './useMutedAuthorFilter';
import { useNostrStorage } from './useNostrStorage';
import { fetchDiscoverNetwork } from '@/lib/discoverNetwork';
import { getStorageKey } from '@/lib/storageKey';

/** How long a computed network is used before it's rebuilt. */
const NETWORK_TTL = 24 * 60 * 60 * 1000;

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

/**
 * The authors behind every Discover tab: a friends-of-friends network of up to
 * 5000 pubkeys, ranked by how many people in the network follow them (see
 * `rankDiscoverNetwork`).
 *
 * Logged in, the network is the user's own. Logged out, or when the user
 * follows nobody yet, it's the curator's (`config.curatorPubkey`).
 *
 * Building a network downloads hundreds of contact lists, so the result is
 * kept in localStorage and rebuilt at most once a day. Pass `enabled: false`
 * on pages that render the hook without showing Discover, so the download
 * only happens for people who actually look at it.
 *
 * @returns `authors` minus muted pubkeys (`undefined` while loading), and a
 *   `key` that changes whenever `authors` does, for query keys.
 */
export function useDiscoverAuthors(enabled = true): { authors: string[] | undefined; key: string } {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { data: followData } = useFollowList();
  const { excludeMuted, mutedKey } = useMutedAuthorFilter();

  const seed = user
    ? followData === undefined
      ? undefined
      : followData.pubkeys.length > 0 ? user.pubkey : config.curatorPubkey
    : config.curatorPubkey;
  const waitingForFollows = !!user && followData === undefined;

  const storageKey = getStorageKey(config.appId, 'discoverNetwork');

  const { data, dataUpdatedAt, isError } = useQuery<string[]>({
    queryKey: ['discover-network', seed ?? ''],
    queryFn: async ({ signal }) => {
      const authors = await fetchDiscoverNetwork(nostr, store, seed!, signal);
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

  const authors = useMemo(() => {
    // Nothing to build a network from (logged out with no curator configured).
    if (!seed && !waitingForFollows) return [];
    if (data) return excludeMuted(data);
    // Settle on an empty network so feeds show their empty state (with a
    // retry) instead of loading forever.
    return isError ? [] : undefined;
  }, [seed, waitingForFollows, data, isError, excludeMuted]);

  return { authors, key: `${seed ?? ''}:${dataUpdatedAt}:${mutedKey}` };
}
