import { useInfiniteQuery } from '@tanstack/react-query';

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

export interface GetFeedResponse {
  feed: Array<{
    post: BlueskyPost;
    feedContext?: string;
  }>;
  cursor?: string;
}

/** A single page of results returned by the hook. */
export interface BlueskyTrendingPage {
  posts: BlueskyPost[];
  cursor?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BSKY_PUBLIC_API = 'https://api.bsky.app/xrpc';

/** Bluesky's official Discover feed — curated trending content, no NSFW. */
const DISCOVER_FEED_URI = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchTrendingPage(
  cursor: string | undefined,
  signal?: AbortSignal,
): Promise<BlueskyTrendingPage> {
  const params = new URLSearchParams({
    feed: DISCOVER_FEED_URI,
    limit: String(PAGE_SIZE),
  });

  if (cursor) {
    params.set('cursor', cursor);
  }

  const res = await fetch(`${BSKY_PUBLIC_API}/app.bsky.feed.getFeed?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) return { posts: [] };

  const data: GetFeedResponse = await res.json();
  if (!data.feed) return { posts: [] };

  return {
    posts: data.feed.map((item) => item.post),
    cursor: data.cursor,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches trending/popular posts from Bluesky's official Discover feed.
 * Returns curated, high-engagement content without NSFW.
 * Supports infinite scroll via cursor-based pagination.
 */
export function useBlueskyTrending() {
  return useInfiniteQuery({
    queryKey: ['bluesky-trending'],
    queryFn: ({ pageParam, signal }) => fetchTrendingPage(pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: 2,
  });
}
