import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { useEventStore } from '@/hooks/useEventStore';
import { contactListPubkeys, fetchContactList } from '@/lib/contactList';

/**
 * Fetches the follow list (kind 3 `p` tags) for the curator pubkey.
 * Returns the curator's pubkey + all pubkeys they follow.
 *
 * Reads via `fetchContactList`, which queries relays then falls back to the
 * IndexedDB event store on a relay miss so an existing list isn't blanked out
 * by a transient empty response.
 *
 * The curator pubkey is read from `config.curatorPubkey`. When unset the
 * hook is disabled and returns `undefined`.
 */
export function useCuratorFollowList() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const eventStore = useEventStore();
  const curatorPubkey = config.curatorPubkey;

  return useQuery<string[]>({
    queryKey: ['curator-follow-list', curatorPubkey],
    queryFn: async ({ signal }) => {
      if (!curatorPubkey) return [];

      const store = await eventStore;
      const event = await fetchContactList(nostr, store, curatorPubkey, { signal });

      // Include the curator themselves
      return [...new Set([curatorPubkey, ...contactListPubkeys(event)])];
    },
    enabled: !!curatorPubkey,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
}
