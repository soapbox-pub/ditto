import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmojifiedText } from '@/components/CustomEmoji';
import { getAvatarShape } from '@/lib/avatarShape';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { isEventMuted } from '@/lib/muteHelpers';
import { useAuthor } from '@/hooks/useAuthor';
import { useOpenPost } from '@/hooks/useOpenPost';
import { useSortedPosts } from '@/hooks/useTrending';
import { useMuteList } from '@/hooks/useMuteList';

/** Hot posts widget for the right sidebar. */
export function HotPostsWidget() {
  const { data: rawPosts, isLoading } = useSortedPosts('hot', 5);
  const { muteItems } = useMuteList();

  const posts = useMemo(() => {
    if (!rawPosts || muteItems.length === 0) return rawPosts;
    return rawPosts.filter((e) => !isEventMuted(e, muteItems));
  }, [rawPosts, muteItems]);

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

  if (!posts || posts.length === 0) {
    return <p className="text-sm text-muted-foreground p-1">No hot posts right now.</p>;
  }

  return (
    <div className="space-y-0.5">
      {posts.slice(0, 5).map((event) => (
        <HotPostCard key={event.id} event={event} />
      ))}
      <div className="pt-1 px-2">
        <Link to="/trends" className="text-xs text-primary hover:underline">View all on Trends</Link>
      </div>
    </div>
  );
}

/** Compact hot post card for the sidebar widget. */
function HotPostCard({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const encodedId = useMemo(() => nip19.neventEncode({ id: event.id, author: event.pubkey }), [event]);
  const { onClick: openPost, onAuxClick } = useOpenPost(`/${encodedId}`);

  const snippet = useMemo(() => {
    const clean = event.content.replace(/https?:\/\/\S+/g, '').trim();
    if (clean.length > 100) return clean.slice(0, 100) + '\u2026';
    return clean || '(media)';
  }, [event.content]);

  return (
    <button
      onClick={openPost}
      onAuxClick={onAuxClick}
      className="block w-full text-left hover:bg-secondary/40 px-2 py-2 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Avatar shape={avatarShape} className="size-4">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs font-semibold truncate">
          {author.data?.event ? (
            <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
          ) : displayName}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">&middot; {timeAgo(event.created_at)}</span>
      </div>
      <p className="text-[13px] text-muted-foreground leading-snug line-clamp-2">{snippet}</p>
    </button>
  );
}
