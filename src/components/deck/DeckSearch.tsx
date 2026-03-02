import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useStreamPosts } from '@/hooks/useStreamPosts';

/** Search column for the deck layout. */
export function DeckSearch() {
  const [query, setQuery] = useState('');

  const { posts, isLoading } = useStreamPosts(query, {
    includeReplies: true,
    mediaType: 'all',
  });

  return (
    <div>
      {/* Search input */}
      <div className="px-3 py-3 border-b border-border">
        <div className="relative">
          <Input
            type="text"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pr-10 bg-secondary/50 border-border focus-visible:ring-1 rounded-lg"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Results */}
      {isLoading && posts.length === 0 ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-full shrink-0" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
              <div className="space-y-1.5 mt-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : posts.length > 0 ? (
        <div>
          {posts.map((event) => (
            <NoteCard key={event.id} event={event} />
          ))}
        </div>
      ) : query.trim() ? (
        <div className="py-12 text-center text-muted-foreground text-sm">No posts found.</div>
      ) : (
        <div className="py-12 text-center text-muted-foreground text-sm">Enter a query to search.</div>
      )}
    </div>
  );
}
