import { useMemo } from 'react';
import { Monitor } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { DITTO_RELAYS } from '@/lib/appRelays';
import { useAppContext } from '@/hooks/useAppContext';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useMuteList } from '@/hooks/useMuteList';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

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

/** Feed of posts published by a given client application (NIP-89 `client` tag). */
export function ClientFeedPage() {
  const { config } = useAppContext();
  const { name } = useParams<{ name: string }>();
  const { nostr } = useNostr();
  const { feedSettings } = useFeedSettings();
  const { muteItems } = useMuteList();

  const clientName = (name ?? '').trim();

  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));
  const kindsKey = [...kinds].sort().join(',');

  useSeoMeta({
    title: clientName ? `${clientName} | ${config.appName}` : `Client Feed | ${config.appName}`,
    description: clientName ? `Posts published with ${clientName}` : 'Client feed',
  });

  const queryKey = useMemo(
    () => ['client-feed', clientName, kindsKey],
    [clientName, kindsKey],
  );
  const handleRefresh = usePageRefresh(queryKey);

  const { data: events, isLoading } = useQuery<NostrEvent[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const ditto = nostr.group(DITTO_RELAYS);
      const filter: NostrFilter = { kinds, limit: 40 };
      // `#${letter}` index signature requires multi-letter keys to be assigned dynamically.
      (filter as Record<string, unknown>)['#client'] = [clientName];
      const results = await ditto.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });
      return results.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: clientName.length > 0,
  });

  const filteredEvents = useMemo(() => {
    if (!events || muteItems.length === 0) return events;
    return events.filter((e) => !isEventMuted(e, muteItems));
  }, [events, muteItems]);

  if (!clientName) return null;

  return (
    <main className="">
      <PageHeader
        title={clientName}
        icon={<span className="text-muted-foreground shrink-0"><Monitor className="size-5" /></span>}
      />

      <PullToRefresh onRefresh={handleRefresh}>
        {isLoading ? (
          <FeedSkeleton />
        ) : filteredEvents && filteredEvents.length > 0 ? (
          <div>
            {filteredEvents.map((event) => <NoteCard key={event.id} event={event} />)}
          </div>
        ) : (
          <div className="py-16 text-center text-muted-foreground px-4">
            <span className="break-all">No posts found published with {clientName}.</span>
          </div>
        )}
      </PullToRefresh>
    </main>
  );
}

export default ClientFeedPage;
