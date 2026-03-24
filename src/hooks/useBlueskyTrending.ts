import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlueskyAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface BlueskyImage {
  thumb: string;
  fullsize: string;
  alt: string;
  aspectRatio?: { width: number; height: number };
}

export interface BlueskyExternal {
  uri: string;
  title: string;
  description: string;
  thumb?: string;
}

export interface BlueskyEmbed {
  $type: string;
  images?: BlueskyImage[];
  external?: BlueskyExternal;
}

export interface BlueskyPost {
  uri: string;
  cid: string;
  author: BlueskyAuthor;
  record: {
    $type: string;
    text: string;
    createdAt: string;
    langs?: string[];
    embed?: BlueskyEmbed;
  };
  embed?: BlueskyEmbed;
  replyCount: number;
  repostCount: number;
  likeCount: number;
  quoteCount: number;
  indexedAt: string;
}

interface GetFeedResponse {
  feed: Array<{
    post: BlueskyPost;
    feedContext?: string;
  }>;
  cursor?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BSKY_PUBLIC_API = 'https://api.bsky.app/xrpc';

/** Bluesky's official Discover feed — curated trending content, no NSFW. */
const DISCOVER_FEED_URI = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchTrendingPosts(signal?: AbortSignal): Promise<BlueskyPost[]> {
  const params = new URLSearchParams({
    feed: DISCOVER_FEED_URI,
    limit: '30',
  });

  const res = await fetch(`${BSKY_PUBLIC_API}/app.bsky.feed.getFeed?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) return [];

  const data: GetFeedResponse = await res.json();
  if (!data.feed) return [];

  return data.feed.map((item) => item.post);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches trending/popular posts from Bluesky's official Discover feed.
 * Returns curated, high-engagement content without NSFW.
 */
export function useBlueskyTrending() {
  return useQuery({
    queryKey: ['bluesky-trending'],
    queryFn: ({ signal }) => fetchTrendingPosts(signal),
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: 2,
  });
}
