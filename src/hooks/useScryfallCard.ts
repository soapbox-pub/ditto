import { useQuery } from '@tanstack/react-query';
import { fetchScryfallCard, type ScryfallCard, type ScryfallLookup } from '@/lib/scryfall';

/**
 * Fetch a Magic: The Gathering card from the Scryfall API.
 *
 * Pass `null` to disable the query (e.g. while the lookup key is still being
 * resolved). Card data is cached aggressively — Scryfall card records change
 * rarely and the API has a ~10 req/sec rate limit.
 */
export function useScryfallCard(lookup: ScryfallLookup | null) {
  return useQuery<ScryfallCard | null>({
    queryKey: ['scryfall-card', lookup],
    queryFn: ({ signal }) => fetchScryfallCard(lookup!, signal),
    enabled: !!lookup,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    retry: 1,
  });
}
