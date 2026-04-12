import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Repeat2, Heart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import type { BlueskyPost, GetFeedResponse } from '@/hooks/useBlueskyTrending';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/formatNumber';

const BSKY_PUBLIC_API = 'https://api.bsky.app/xrpc';
const DISCOVER_FEED_URI = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const WIDGET_LIMIT = 5;

/**
 * Dedicated query for the widget — fetches a single page of 5 posts.
 * Uses a separate query key from the full BlueskyPage infinite query
 * so they don't share cached pages.
 */
function useBlueskyWidgetPosts() {
  return useQuery({
    queryKey: ['bluesky-widget'],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        feed: DISCOVER_FEED_URI,
        limit: String(WIDGET_LIMIT),
      });
      const res = await fetch(`${BSKY_PUBLIC_API}/app.bsky.feed.getFeed?${params}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Bluesky API error: ${res.status}`);
      const data: GetFeedResponse = await res.json();
      if (!data.feed) return [];
      return data.feed.map((item) => item.post);
    },
    staleTime: 15 * 60_000, // 15 minutes
    gcTime: 60 * 60_000,    // 1 hour
    retry: 2,
  });
}

/** Bluesky trending posts widget for the sidebar. */
export function BlueskyWidget() {
  const { data: posts, isLoading, isError } = useBlueskyWidgetPosts();

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-muted-foreground p-1">Failed to load Bluesky posts.</p>;
  }

  if (!posts || posts.length === 0) {
    return <p className="text-sm text-muted-foreground p-1">No trending posts right now.</p>;
  }

  return (
    <div className="space-y-0.5">
      {posts.map((post) => (
        <BlueskyPostCard key={post.cid} post={post} />
      ))}
      <div className="pt-1 px-2">
        <Link to="/bluesky" className="text-xs text-primary hover:underline">View more on Bluesky</Link>
      </div>
    </div>
  );
}

function BlueskyPostCard({ post }: { post: BlueskyPost }) {
  const text = post.record.text;
  const snippet = text.length > 120 ? text.slice(0, 120) + '...' : text;
  const webUrl = `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`;
  const internalUrl = `/i/${encodeURIComponent(webUrl)}`;

  const timeAgo = useMemo(() => {
    const diff = Date.now() - new Date(post.indexedAt).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }, [post.indexedAt]);

  return (
    <Link
      to={internalUrl}
      className="block hover:bg-secondary/40 px-2 py-2 rounded-lg transition-colors"
    >
      {/* Author line */}
      <div className="flex items-center gap-1.5 mb-0.5">
        {post.author.avatar ? (
          <img src={post.author.avatar} alt="" className="size-4 rounded-full object-cover" loading="lazy" />
        ) : (
          <div className="size-4 rounded-full bg-sky-500 flex items-center justify-center text-white text-[8px] font-bold">
            {(post.author.displayName ?? post.author.handle).charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-xs font-semibold truncate">{post.author.displayName ?? post.author.handle}</span>
        <span className="text-xs text-muted-foreground shrink-0">&middot; {timeAgo}</span>
      </div>

      {/* Content */}
      <p className="text-[13px] text-muted-foreground leading-snug line-clamp-2 mb-1">{snippet}</p>

      {/* Engagement */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-0.5"><MessageCircle className="size-2.5" />{formatNumber(post.replyCount)}</span>
        <span className="flex items-center gap-0.5"><Repeat2 className="size-2.5" />{formatNumber(post.repostCount)}</span>
        <span className="flex items-center gap-0.5"><Heart className="size-2.5" />{formatNumber(post.likeCount)}</span>
      </div>
    </Link>
  );
}
