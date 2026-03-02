import { useQuery } from '@tanstack/react-query';

/** Author profile data from the Bluesky API. */
export interface BlueskyAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

/** A single image in a Bluesky image embed. */
export interface BlueskyImage {
  thumb: string;
  fullsize: string;
  alt: string;
  aspectRatio?: { width: number; height: number };
}

/** External link embed (link card). */
export interface BlueskyExternal {
  uri: string;
  title: string;
  description: string;
  thumb?: string;
}

/** Bluesky post data returned by the hook. */
export interface BlueskyPostData {
  uri: string;
  cid: string;
  author: BlueskyAuthor;
  text: string;
  createdAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  quoteCount: number;
  images?: BlueskyImage[];
  external?: BlueskyExternal;
}

/** Raw API shape for the post view from getPostThread. */
interface RawPostView {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  record: {
    text?: string;
    createdAt?: string;
  };
  embed?: {
    $type: string;
    images?: BlueskyImage[];
    external?: BlueskyExternal;
  };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
}

/**
 * Fetches a Bluesky post via the public API and returns structured post data.
 *
 * Uses `app.bsky.feed.getPostThread` with `depth=0` to fetch just the post
 * without replies. The author handle is resolved to a DID first if needed.
 */
export function useBlueskyPost(author: string, rkey: string) {
  const isDid = author.startsWith('did:');

  // Step 1: Resolve handle → DID if needed
  const { data: resolvedDid, isLoading: isResolvingDid } = useQuery({
    queryKey: ['bsky-resolve-handle', author],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(author)}`,
        { signal },
      );
      if (!res.ok) return null;
      const data = await res.json() as { did?: string };
      return data.did ?? null;
    },
    enabled: !isDid,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
    retry: false,
  });

  const did = isDid ? author : resolvedDid;

  // Step 2: Fetch the post thread (depth=0 for just the post)
  const query = useQuery({
    queryKey: ['bsky-post', did, rkey],
    queryFn: async ({ signal }): Promise<BlueskyPostData | null> => {
      const atUri = `at://${did}/app.bsky.feed.post/${rkey}`;
      const res = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(atUri)}&depth=0`,
        { signal },
      );
      if (!res.ok) return null;

      const json = await res.json() as { thread?: { post?: RawPostView } };
      const post = json.thread?.post;
      if (!post) return null;

      const images = post.embed?.$type === 'app.bsky.embed.images#view'
        ? post.embed.images
        : undefined;

      const external = post.embed?.$type === 'app.bsky.embed.external#view'
        ? post.embed.external
        : undefined;

      return {
        uri: post.uri,
        cid: post.cid,
        author: {
          did: post.author.did,
          handle: post.author.handle,
          displayName: post.author.displayName,
          avatar: post.author.avatar,
        },
        text: post.record.text ?? '',
        createdAt: post.record.createdAt ?? '',
        likeCount: post.likeCount ?? 0,
        repostCount: post.repostCount ?? 0,
        replyCount: post.replyCount ?? 0,
        quoteCount: post.quoteCount ?? 0,
        images,
        external,
      };
    },
    enabled: !!did,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60,   // 1 hour
    retry: false,
  });

  return {
    ...query,
    isLoading: isResolvingDid || query.isLoading,
  };
}
