import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { useCuratorFollowList } from '@/hooks/useCuratorFollowList';
import { genUserName } from '@/lib/genUserName';
import { getAvatarShape } from '@/lib/avatarShape';
import { timeAgo } from '@/lib/timeAgo';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** Parse the first imeta image URL from a kind 20 photo event. Sanitizes the URL at the parse layer. */
function parseFirstPhoto(tags: string[][]): { url: string; alt?: string } | undefined {
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(' ');
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    const url = sanitizeUrl(parts.url);
    if (url) return { url, alt: parts.alt };
  }
  return undefined;
}

/** Rich photo widget showing the latest photo from follows. */
export function PhotoWidget() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const { data: curatorFollows } = useCuratorFollowList();

  const followPubkeys = followData?.pubkeys;
  const authors = user && followPubkeys?.length ? followPubkeys : curatorFollows;
  const authorsKey = user ? 'follows' : 'curator';

  const { data: event, isLoading } = useQuery<NostrEvent | null>({
    queryKey: ['widget-photo', authorsKey],
    queryFn: async () => {
      const events = await nostr.query([{ kinds: [20], limit: 1, ...(authors ? { authors } : {}) }]);
      return events[0] ?? null;
    },
    staleTime: 5 * 60_000,
    enabled: user ? followPubkeys !== undefined : curatorFollows !== undefined,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-1">
        <Skeleton className="w-full aspect-[4/3] rounded-lg" />
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    );
  }

  if (!event) {
    return <p className="text-sm text-muted-foreground p-1">No photos yet.</p>;
  }

  return <PhotoCard event={event} />;
}

function PhotoCard({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const encodedId = useMemo(() => nip19.neventEncode({ id: event.id, author: event.pubkey }), [event]);

  const photo = useMemo(() => parseFirstPhoto(event.tags), [event.tags]);
  const caption = event.content?.trim();

  if (!photo) return null;

  return (
    <Link to={`/${encodedId}`} className="block group">
      {/* Photo */}
      <div className="rounded-lg overflow-hidden bg-secondary/30">
        <img
          src={photo.url}
          alt={photo.alt ?? caption ?? 'Photo'}
          className="w-full object-cover max-h-[220px] group-hover:scale-[1.02] transition-transform duration-300"
          loading="lazy"
        />
      </div>

      {/* Author + caption */}
      <div className="mt-2 px-0.5 space-y-1">
        <div className="flex items-center gap-1.5">
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
        {caption && (
          <p className="text-[13px] text-muted-foreground leading-snug line-clamp-2">{caption}</p>
        )}
      </div>
    </Link>
  );
}
