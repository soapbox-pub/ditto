import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/MainLayout';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import type { NostrEvent } from '@nostrify/nostrify';

export function HashtagPage() {
  const { tag } = useParams<{ tag: string }>();
  const { nostr } = useNostr();
  const { feedSettings } = useFeedSettings();

  const extraKinds = getEnabledFeedKinds(feedSettings);
  const kinds = [1, ...extraKinds];
  const kindsKey = kinds.sort().join(',');

  useSeoMeta({
    title: `#${tag} | Mew`,
    description: `Posts tagged with #${tag}`,
  });

  const { data: events, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['hashtag', tag ?? '', kindsKey],
    queryFn: async ({ signal }) => {
      if (!tag) return [];
      const results = await nostr.query(
        [{ kinds, '#t': [tag.toLowerCase()], limit: 40 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return results.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!tag,
  });

  return (
    <MainLayout hideMobileTopBar>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        <div className="flex items-center gap-4 px-4 py-3 sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors">
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
        ) : events && events.length > 0 ? (
          events.map((event) => <NoteCard key={event.id} event={event} />)
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            No posts found with #{tag}.
          </div>
        )}
      </main>
    </MainLayout>
  );
}
