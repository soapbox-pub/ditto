import { useMemo } from 'react';
import { useSearchEvents, type SearchEventResult } from '@/hooks/useSearchEvents';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';

/** A single Nostr row in the search dropdown — either a profile or an event. */
export type SearchResult =
  | { type: 'profile'; key: string; followed: boolean; profile: SearchProfile }
  | { type: 'event'; key: string; followed: boolean; event: SearchEventResult };

interface UseSearchResultsOptions {
  /**
   * A pubkey already rendered by the identifier row, dropped from the profile
   * results so the same person isn't listed twice.
   */
  excludePubkey?: string;
  /** How many event results to keep after ranking. */
  eventLimit?: number;
}

function isFollowed(result: SearchResult): boolean {
  return result.followed;
}

function isNotFollowed(result: SearchResult): boolean {
  return !result.followed;
}

/**
 * Profile and event search results merged into one ranked list.
 *
 * Ranking is follow-first, kind-0-first — in that order of precedence:
 *
 * 1. profiles of people you follow
 * 2. events by people you follow
 * 3. everyone else's profiles
 * 4. everyone else's events
 *
 * Follow status outranks kind because someone you follow is nearly always the
 * thing you meant. Searching "polaroids" when a followed author has published
 * an nsite by that name should surface the site, not a stranger who happens to
 * have "polaroids" in their profile.
 */
export function useSearchResults(
  query: string,
  { excludePubkey, eventLimit = 5 }: UseSearchResultsOptions = {},
) {
  const {
    data: profiles,
    isFetching: isFetchingProfiles,
    followedPubkeys,
  } = useSearchProfiles(query);

  const { data: events, isFetching: isFetchingEvents } = useSearchEvents(query);

  const profileResults = useMemo(() => {
    const results: SearchResult[] = [];

    for (const profile of profiles ?? []) {
      if (profile.pubkey === excludePubkey) continue;
      results.push({
        type: 'profile',
        key: `profile:${profile.pubkey}`,
        followed: followedPubkeys.has(profile.pubkey),
        profile,
      });
    }

    return results;
  }, [profiles, excludePubkey, followedPubkeys]);

  const eventResults = useMemo(() => {
    const results: SearchResult[] = [];

    for (const event of events ?? []) {
      results.push({
        type: 'event',
        key: `event:${event.path}`,
        followed: followedPubkeys.has(event.event.pubkey),
        event,
      });
    }

    // Rank before truncating. Relevance order puts a followed author's site
    // wherever the relay put it, so slicing first would drop it in favor of
    // a dozen strangers' articles.
    return [...results.filter(isFollowed), ...results.filter(isNotFollowed)].slice(0, eventLimit);
  }, [events, followedPubkeys, eventLimit]);

  const results = useMemo(() => [
    ...profileResults.filter(isFollowed),
    ...eventResults.filter(isFollowed),
    ...profileResults.filter(isNotFollowed),
    ...eventResults.filter(isNotFollowed),
  ], [profileResults, eventResults]);

  return {
    results,
    /** Profile-only count, used to decide where the country suggestion goes. */
    profileCount: profileResults.length,
    isFetching: isFetchingProfiles || isFetchingEvents,
    followedPubkeys,
  };
}
