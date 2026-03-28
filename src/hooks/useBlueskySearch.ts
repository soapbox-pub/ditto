import { useQuery } from '@tanstack/react-query';

import type { BlueskyPost } from './useBlueskyTrending';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BSKY_PUBLIC_API = 'https://api.bsky.app/xrpc';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlueskySearchResult {
  /** The AT URI of the post */
  uri: string;
  /** Author handle */
  handle: string;
  /** Author display name */
  displayName: string;
  /** Author avatar URL */
  avatar?: string;
  /** Post text (truncated) */
  text: string;
  /** Bsky post URL for opening in browser */
  url: string;
  /** Like count */
  likes: number;
  /** First image thumbnail if available */
  thumbnail?: string;
}

interface SearchPostsResponse {
  posts: BlueskyPost[];
  cursor?: string;
  hitsTotal?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert an AT URI (at://did/collection/rkey) into a bsky.app web URL. */
function postUrl(uri: string, handle: string): string {
  const parts = uri.split('/');
  const rkey = parts[parts.length - 1];
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function searchBluesky(
  query: string,
  signal?: AbortSignal,
): Promise<BlueskySearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    sort: 'top',
    limit: '12',
    lang: 'en',
  });

  const res = await fetch(`${BSKY_PUBLIC_API}/app.bsky.feed.searchPosts?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) return [];

  const data: SearchPostsResponse = await res.json();
  if (!data.posts) return [];

  return data.posts.map((post) => {
    // Extract first image thumbnail from embed
    let thumbnail: string | undefined;
    if (post.embed?.$type === 'app.bsky.embed.images#view' && post.embed?.images?.[0]) {
      thumbnail = post.embed.images[0].thumb;
    } else if (post.embed?.$type === 'app.bsky.embed.external#view' && post.embed?.external?.thumb) {
      thumbnail = post.embed.external.thumb;
    }

    return {
      uri: post.uri,
      handle: post.author.handle,
      displayName: post.author.displayName ?? post.author.handle,
      avatar: post.author.avatar,
      text: post.record.text.slice(0, 200),
      url: postUrl(post.uri, post.author.handle),
      likes: post.likeCount,
      thumbnail,
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Hook to search Bluesky posts by keyword. */
export function useBlueskySearch(query: string) {
  return useQuery({
    queryKey: ['bluesky-search', query],
    queryFn: ({ signal }) => searchBluesky(query, signal),
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    placeholderData: (prev) => prev,
  });
}
