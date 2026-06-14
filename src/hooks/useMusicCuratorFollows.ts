import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useNostrStorage } from '@/hooks/useNostrStorage';
import { contactListPubkeys, fetchContactList } from '@/lib/contactList';

/**
 * Music curator pubkey (Derek / npub18ams6e...).
 *
 * This is the same pubkey that maintains the curated music-artists list
 * (kind 30000). His kind 3 follow list is used to filter playlists on
 * the Discover page.
 */
const MUSIC_CURATOR_PUBKEY = '3f770d65d3a764a9c5cb503ae123e62ec7598ad035d836e2a810f3877a745b24';

/**
 * Fetches the music curator's kind 3 follow list.
 *
 * Returns the pubkeys that Derek (the music curator) follows.
 * Used to filter playlists on the Discover page so only playlists
 * from people he follows are shown.
 *
 * Reads via `fetchContactList`, which queries relays then falls back to the
 * IndexedDB event store on a relay miss.
 */
export function useMusicCuratorFollows() {
  const { nostr } = useNostr();
  const eventStore = useNostrStorage();

  return useQuery<string[]>({
    queryKey: ['music-curator-follows', MUSIC_CURATOR_PUBKEY],
    queryFn: async ({ signal }) => {
      const store = await eventStore;
      const event = await fetchContactList(nostr, store, MUSIC_CURATOR_PUBKEY, { signal });
      return contactListPubkeys(event);
    },
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 60 * 60 * 1000, // 1 hr
  });
}
