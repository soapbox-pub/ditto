import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { DITTO_RELAY } from '@/lib/appRelays';
import { useAppContext } from '@/hooks/useAppContext';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useMuteList } from '@/hooks/useMuteList';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

export function HashtagPage() {
  const { config } = useAppContext();
  const { tag } = useParams<{ tag: string }>();
  const { nostr } = useNostr();
  const { feedSettings } = useFeedSettings();
  const { muteItems } = useMuteList();

  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));
  const kindsKey = [...kinds].sort().join(',');

  useSeoMeta({
    title: `#${tag} | ${config.appName}`,
    description: `Posts tagged with #${tag}`,
  });

  const { data: events, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['hashtag', tag ?? '', kindsKey],
    queryFn: async ({ signal }) => {
      if (!tag) return [];
      const ditto = nostr.relay(DITTO_RELAY);
      const results = await ditto.query(
        [{ kinds, '#t': [tag.toLowerCase()], search: 'sort:hot', limit: 40 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
      return results;
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
          <h1 className="text-xl font-bold">#{tag}</h1>
        </div>

        {isLoading ? (
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
        ) : filteredEvents && filteredEvents.length > 0 ? (
          filteredEvents.map((event) => <NoteCard key={event.id} event={event} />)
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            No posts found with #{tag}.
          </div>
        )}
      </main>
  );
}
