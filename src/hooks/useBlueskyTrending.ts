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

interface SearchPostsResponse {
  posts: BlueskyPost[];
  cursor?: string;
  hitsTotal?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BSKY_PUBLIC_API = 'https://public.api.bsky.app/xrpc';

// Curated trending topics that surface interesting content
const TRENDING_TOPICS = [
  'breaking news',
  'science discovery',
  'technology',
  'photography',
  'art',
  'music',
  'space',
  'climate',
  'sports',
  'film',
];

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchTrendingPosts(signal?: AbortSignal): Promise<BlueskyPost[]> {
  // Pick 3 random topics to query for variety each time
  const shuffled = [...TRENDING_TOPICS].sort(() => Math.random() - 0.5);
  const selectedTopics = shuffled.slice(0, 3);

  const results = await Promise.all(
    selectedTopics.map(async (topic) => {
      const params = new URLSearchParams({
        q: topic,
        sort: 'top',
        limit: '10',
        lang: 'en',
      });

      const res = await fetch(`${BSKY_PUBLIC_API}/app.bsky.feed.searchPosts?${params}`, {
        signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) return [];

      const data: SearchPostsResponse = await res.json();
      return data.posts ?? [];
    }),
  );

  // Flatten, deduplicate by URI, sort by engagement (likes + reposts)
  const allPosts = results.flat();
  const uniqueMap = new Map<string, BlueskyPost>();
  for (const post of allPosts) {
    if (!uniqueMap.has(post.uri)) {
      uniqueMap.set(post.uri, post);
    }
  }

  return Array.from(uniqueMap.values())
    .sort((a, b) => (b.likeCount + b.repostCount) - (a.likeCount + a.repostCount))
    .slice(0, 24);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches trending/popular posts from Bluesky using the public search API.
 * Queries multiple trending topics and returns the most-engaged posts.
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
