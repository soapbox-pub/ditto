import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginArea } from '@/components/auth/LoginArea';
import { cn } from '@/lib/utils';

export function BookmarksPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Bookmarks | ${config.appName}`,
    description: 'Your saved bookmarks on Nostr.',
  });

  const { user } = useCurrentUser();
  const { events, isLoading, isLoadingEvents, bookmarkedIds } = useBookmarks();

  return (
      <main className="">
        {/* Sticky header */}
        <div className={cn('sidebar:sticky sidebar:top-0', 'flex items-center gap-4 px-4 pt-4 pb-5 bg-background/80 backdrop-blur-md z-10')}>
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Bookmark className="size-5" />
            <h1 className="text-xl font-bold">Bookmarks</h1>
          </div>
        </div>

        {/* Content */}
        {!user ? (
          <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Bookmark className="size-8 text-primary" />
            </div>
            <div className="space-y-2 max-w-xs">
              <h2 className="text-xl font-bold">Save posts for later</h2>
              <p className="text-muted-foreground text-sm">
                Log in to bookmark posts and find them here anytime.
              </p>
            </div>
            <LoginArea className="max-w-60" />
          </div>
        ) : isLoading || (bookmarkedIds.length > 0 && isLoadingEvents) ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <BookmarkSkeleton key={i} />
            ))}
          </div>
        ) : events.length > 0 ? (
          <div>
            {events.map((event) => (
              <NoteCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
            <div className="p-4 rounded-full bg-muted">
              <Bookmark className="size-8 text-muted-foreground" />
            </div>
            <div className="space-y-2 max-w-xs">
              <h2 className="text-xl font-bold">No bookmarks yet</h2>
              <p className="text-muted-foreground text-sm">
                When you bookmark a post, it will show up here. Tap the bookmark icon on any post to save it.
              </p>
            </div>
          </div>
        )}
      </main>
  );
}

function BookmarkSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-8" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="flex gap-12 mt-2">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
