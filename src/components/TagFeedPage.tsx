import { useMemo, type ReactNode } from 'react';
import { ArrowLeft, Plus, Check, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { NoteCard } from '@/components/NoteCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DITTO_RELAYS } from '@/lib/appRelays';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useInterests } from '@/hooks/useInterests';
import { useMuteList } from '@/hooks/useMuteList';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

interface TagFeedPageProps {
  /** The tag value to filter by. */
  tag: string;
  /** The Nostr filter key, e.g. '#t' or '#g'. */
  filterKey: '#t' | '#g';
  /** Icon shown before the title in the header. */
  icon?: ReactNode;
  /** Title text displayed in the header. */
  title: string;
  /** Whether to show a follow/unfollow button (hashtags only). */
  followable?: boolean;
  /** Extra relay search param (e.g. 'sort:hot'). */
  search?: string;
  /** Empty state message. */
  emptyMessage: string;
}

function FeedSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TagFeedPage({
  tag,
  filterKey,
  icon,
  title,
  followable = false,
  search,
  emptyMessage,
}: TagFeedPageProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { feedSettings } = useFeedSettings();
  const { muteItems } = useMuteList();
  const interestTagName = filterKey === '#g' ? 'g' : 't';
  const { hasInterest, addInterest, removeInterest } = useInterests(interestTagName);

  const isFollowing = followable ? hasInterest(tag) : false;
  const interestPending = addInterest.isPending || removeInterest.isPending;

  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));
  const kindsKey = [...kinds].sort().join(',');

  const { data: events, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['tag-feed', filterKey, tag, kindsKey],
    queryFn: async ({ signal }) => {
      const ditto = nostr.group(DITTO_RELAYS);
      const tagFilter: NostrFilter = { kinds, limit: 40, ...(search ? { search } : {}) };
      // NostrFilter uses `#${letter}` index signature — assign after construction to satisfy TS
      (tagFilter as Record<string, unknown>)[filterKey] = [tag];
      return ditto.query([tagFilter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });
    },
    enabled: !!tag,
  });

  const filteredEvents = useMemo(() => {
    if (!events || muteItems.length === 0) return events;
    return events.filter((e) => !isEventMuted(e, muteItems));
  }, [events, muteItems]);

  return (
    <main className="">
      <div className={cn(STICKY_HEADER_CLASS, 'flex items-center gap-4 px-4 pt-4 pb-5 bg-background/80 backdrop-blur-md z-10')}>
        <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
        <h1 className="text-xl font-bold flex-1 truncate min-w-0">{title}</h1>
        {followable && user && tag && (
          <Button
            size="sm"
            variant={isFollowing ? 'outline' : 'default'}
            className="rounded-full gap-1.5 shrink-0"
            disabled={interestPending}
            onClick={() => isFollowing ? removeInterest.mutate(tag) : addInterest.mutate(tag)}
          >
            {interestPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : isFollowing ? (
              <><Check className="size-3.5" /> Following</>
            ) : (
              <><Plus className="size-3.5" /> Follow</>
            )}
          </Button>
        )}
      </div>

      {isLoading ? (
        <FeedSkeleton />
      ) : filteredEvents && filteredEvents.length > 0 ? (
        filteredEvents.map((event) => <NoteCard key={event.id} event={event} />)
      ) : (
        <div className="py-16 text-center text-muted-foreground px-4">
          <span className="break-all">{emptyMessage}</span>
        </div>
      )}
    </main>
  );
}
