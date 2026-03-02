import { Bookmark } from 'lucide-react';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/** Bookmarks list for a deck column. */
export function DeckBookmarks() {
  const { user } = useCurrentUser();
  const { events, isLoading, isLoadingEvents, bookmarkedIds } = useBookmarks();

  if (!user) {
    return (
      <div className="py-12 px-4 text-center text-muted-foreground text-sm">
        Log in to see bookmarks.
      </div>
    );
  }

  if (isLoading || (bookmarkedIds.length > 0 && isLoadingEvents)) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex gap-3">
              <Skeleton className="size-11 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-12 px-4 flex flex-col items-center gap-3 text-center">
        <Bookmark className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No bookmarks yet.</p>
      </div>
    );
  }

  return (
    <div>
      {events.map((event) => (
        <NoteCard key={event.id} event={event} />
      ))}
    </div>
  );
}
