import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BSKY_PUBLIC_API = 'https://api.bsky.app/xrpc';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlueskyActorResult {
  /** DID of the actor */
  did: string;
  /** Handle (e.g. jay.bsky.team) */
  handle: string;
  /** Display name */
  displayName?: string;
  /** Avatar URL */
  avatar?: string;
  /** Bio / description */
  description?: string;
  /** Bsky profile URL */
  url: string;
}

interface SearchActorsTypeaheadResponse {
  actors: Array<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    description?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function searchActors(
  query: string,
  signal?: AbortSignal,
): Promise<BlueskyActorResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '8',
  });

  const res = await fetch(
    `${BSKY_PUBLIC_API}/app.bsky.actor.searchActorsTypeahead?${params}`,
    { signal, headers: { Accept: 'application/json' } },
  );

  if (!res.ok) return [];

  const data: SearchActorsTypeaheadResponse = await res.json();
  if (!data.actors) return [];

  return data.actors.map((actor) => ({
    did: actor.did,
    handle: actor.handle,
    displayName: actor.displayName,
    avatar: actor.avatar,
    description: actor.description,
    url: `https://bsky.app/profile/${actor.handle}`,
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Hook to search Bluesky users by name/handle (typeahead). */
export function useBlueskyActorSearch(query: string) {
  return useQuery({
    queryKey: ['bluesky-actor-search', query],
    queryFn: ({ signal }) => searchActors(query, signal),
    enabled: query.trim().length >= 1,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    placeholderData: (prev) => prev,
  });
}
