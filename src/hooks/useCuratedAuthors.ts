import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useDiscoverCurators } from '@/hooks/useDiscoverCurators';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { contactListPubkeys } from '@/lib/contactList';
import { curatorPubkeys, curatorsKey, fetchCuratorEvents } from '@/lib/discoverCurators';

/**
 * Everyone the curators pick (see `useDiscoverCurators`): each curator account
 * and who it follows, and the members of each curated list.
 *
 * Contact lists are read via `fetchContactList`, which falls back to the
 * IndexedDB event store on a relay miss so an existing list isn't blanked out
 * by a transient empty response. With no curators, there's no one.
 */
export function useCuratedAuthors() {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const curators = useDiscoverCurators();

  return useQuery<string[]>({
    queryKey: ['curated-authors', curatorsKey(curators)],
    queryFn: async ({ signal }) => {
      if (curators.length === 0) return [];
      const events = await fetchCuratorEvents(nostr, store, curators, signal);
      return [...new Set([...curatorPubkeys(curators), ...events.flatMap(contactListPubkeys)])];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
}
