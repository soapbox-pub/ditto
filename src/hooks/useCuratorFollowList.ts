import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';

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
 *
 * The curator pubkey is read from `config.curatorPubkey`. When unset the
 * hook is disabled and returns `undefined`.
 */
export function useCuratorFollowList() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const curatorPubkey = config.curatorPubkey;

  return useQuery<string[]>({
    queryKey: ['curator-follow-list', curatorPubkey],
    queryFn: async ({ signal }) => {
      if (!curatorPubkey) return [];

      const [event] = await nostr.query(
        [{ kinds: [3], authors: [curatorPubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      if (!event) return [curatorPubkey];

      const pubkeys = event.tags
        .filter(([name]) => name === 'p')
        .map(([, pk]) => pk);

      // Include the curator themselves
      const allPubkeys = [...new Set([curatorPubkey, ...pubkeys])];
      setCached(allPubkeys);
      return allPubkeys;
    },
    enabled: !!curatorPubkey,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    placeholderData: getCached(),
  });
}
