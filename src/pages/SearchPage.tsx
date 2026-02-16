import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { MainLayout } from '@/components/MainLayout';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { NostrEvent } from '@nostrify/nostrify';

export function SearchPage() {
  useSeoMeta({
    title: 'Search | Mew',
    description: 'Search Nostr',
  });

  const [query, setQuery] = useState('');
  const { nostr } = useNostr();

  const { data: results, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['search', query],
    queryFn: async ({ signal }) => {
      if (!query.trim()) return [];

      // If the query is a hashtag, search by tag
      const tag = query.startsWith('#') ? query.slice(1) : query;
      const events = await nostr.query(
        [{ kinds: [1], '#t': [tag.toLowerCase()], limit: 30 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: query.trim().length > 0,
  });

  return (
    <MainLayout>
      <main className="flex-1 min-w-0 max-w-[600px] border-x border-border min-h-screen">
        <div className="flex items-center gap-3 px-4 py-3 sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors shrink-0">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search hashtags..."
              className="pl-10 rounded-full bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex gap-3">
                  <Skeleton className="size-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : results && results.length > 0 ? (
          results.map((event) => <NoteCard key={event.id} event={event} />)
        ) : query.trim() ? (
          <div className="py-16 text-center text-muted-foreground">
            No results found for "{query}".
          </div>
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            Search for hashtags to discover content.
          </div>
        )}
      </main>
    </MainLayout>
  );
}
