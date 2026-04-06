import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/**
 * The curator pubkey whose follow list curates the Ditto feed.
 * npub1jvnpg4c6ljadf5t6ry0w9q0rnm4mksde87kglkrc993z46c39axsgq89sc
 */
export const CURATOR_PUBKEY = '932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d';

/** localStorage key for cached curator follow list. */
const CACHE_KEY = 'ditto:curatorFollowList';

/** Read cached curator follow list from localStorage. */
function getCached(): string[] | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw);
    if (!Array.isArray(cached)) return undefined;
    return cached;
  } catch {
    return undefined;
  }
}

/** Persist curator follow list to localStorage. */
function setCached(pubkeys: string[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(pubkeys));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

/**
 * Fetches the follow list (kind 3 `p` tags) for the curator pubkey.
 * Returns the curator's pubkey + all pubkeys they follow.
 * Cached in localStorage for instant display on return visits.
 */
export function useCuratorFollowList() {
  const { nostr } = useNostr();

  return useQuery<string[]>({
    queryKey: ['curator-follow-list', CURATOR_PUBKEY],
    queryFn: async ({ signal }) => {
      const [event] = await nostr.query(
        [{ kinds: [3], authors: [CURATOR_PUBKEY], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      if (!event) return [CURATOR_PUBKEY];

      const pubkeys = event.tags
        .filter(([name]) => name === 'p')
        .map(([, pk]) => pk);

      // Include the curator themselves
      const allPubkeys = [...new Set([CURATOR_PUBKEY, ...pubkeys])];
      setCached(allPubkeys);
      return allPubkeys;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    placeholderData: getCached(),
  });
}
