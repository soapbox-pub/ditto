/**
 * Generic compact feed widget that queries Nostr events by kind and renders
 * them as a compact list. Used for Photos, Music, Articles, Events, Books widgets.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { getAvatarShape } from '@/lib/avatarShape';
import { timeAgo } from '@/lib/timeAgo';

interface FeedWidgetProps {
  /** Event kind(s) to fetch. */
  kinds: number[];
  /** Link to the full feed page. */
  feedPath: string;
  /** Label for "View all" link. */
  feedLabel: string;
  /** Number of items to show. */
  limit?: number;
  /** Empty state message. */
  emptyMessage?: string;
}

/** Compact feed widget showing recent events for given kind(s). */
export function FeedWidget({ kinds, feedPath, feedLabel, limit = 5, emptyMessage = 'No content yet.' }: FeedWidgetProps) {
  const { nostr } = useNostr();

  const kindsKey = kinds.join(',');
  const { data: events, isLoading } = useQuery({
    queryKey: ['widget-feed', kindsKey, limit],
    queryFn: async () => {
      return nostr.query([{ kinds, limit: limit * 2 }]);
    },
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() => (events ?? []).slice(0, limit), [events, limit]);

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
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return <p className="text-sm text-muted-foreground p-1">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-0.5">
      {filtered.map((event) => (
        <CompactEventCard key={event.id} event={event} />
      ))}
      <div className="pt-1 px-2">
        <Link to={feedPath} className="text-xs text-primary hover:underline">{feedLabel}</Link>
      </div>
    </div>
  );
}

/** Minimal event card for sidebar widgets. */
function CompactEventCard({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const encodedId = useMemo(() => nip19.neventEncode({ id: event.id, author: event.pubkey }), [event]);

  // Try to get a title from tags (articles, events, etc.)
  const title = event.tags.find(([t]) => t === 'title')?.[1];

  // Build a snippet from content
  const snippet = useMemo(() => {
    if (title) return title;
    const clean = event.content.replace(/https?:\/\/\S+/g, '').trim();
    if (clean.length > 100) return clean.slice(0, 100) + '...';
    return clean || '(media)';
  }, [event.content, title]);

  return (
    <Link
      to={`/${encodedId}`}
      className="block hover:bg-secondary/40 px-2 py-2 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Avatar shape={avatarShape} className="size-4">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs font-semibold truncate">{displayName}</span>
        <span className="text-xs text-muted-foreground shrink-0">&middot; {timeAgo(event.created_at)}</span>
      </div>
      <p className="text-[13px] text-muted-foreground leading-snug line-clamp-2">{snippet}</p>
    </Link>
  );
}
