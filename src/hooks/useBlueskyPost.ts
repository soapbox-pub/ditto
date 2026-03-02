import { useQuery } from '@tanstack/react-query';

import type { ExternalImage, ExternalExternal, ExternalPostData } from '@/components/ExternalPostCard';

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
    images?: ExternalImage[];
    external?: ExternalExternal & { uri: string; description: string };
  };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
}

/**
 * Fetches a Bluesky post via the public API and returns it as an
 * `ExternalPostData` object for rendering in `ExternalPostCard`.
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
    queryFn: async ({ signal }): Promise<ExternalPostData | null> => {
      const atUri = `at://${did}/app.bsky.feed.post/${rkey}`;
      const res = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(atUri)}&depth=0`,
        { signal },
      );
      if (!res.ok) return null;

      const json = await res.json() as { thread?: { post?: RawPostView } };
      const post = json.thread?.post;
      if (!post) return null;

      const handle = post.author.handle;

      const images: ExternalImage[] | undefined =
        post.embed?.$type === 'app.bsky.embed.images#view' && post.embed.images
          ? post.embed.images.map((img) => ({ thumb: img.thumb, alt: img.alt }))
          : undefined;

      const external: ExternalExternal | undefined =
        post.embed?.$type === 'app.bsky.embed.external#view' && post.embed.external
          ? { title: post.embed.external.title, thumb: post.embed.external.thumb }
          : undefined;

      return {
        displayName: post.author.displayName || handle,
        handle,
        avatar: post.author.avatar,
        text: post.record.text ?? '',
        createdAt: post.record.createdAt ?? '',
        postUrl: `https://bsky.app/profile/${handle}/post/${rkey}`,
        profileUrl: `https://bsky.app/profile/${handle}`,
        replyCount: post.replyCount ?? 0,
        repostCount: (post.repostCount ?? 0) + (post.quoteCount ?? 0),
        likeCount: post.likeCount ?? 0,
        images,
        external,
      };
    },
    enabled: !!did,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
    retry: false,
  });

  return {
    ...query,
    isLoading: isResolvingDid || query.isLoading,
  };
}
