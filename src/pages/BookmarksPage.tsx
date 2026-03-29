import { useSeoMeta } from '@unhead/react';
import { Bookmark } from 'lucide-react';
import { NoteCard } from '@/components/NoteCard';
import { PageHeader } from '@/components/PageHeader';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { LoginArea } from '@/components/auth/LoginArea';

export function BookmarksPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Bookmarks | ${config.appName}`,
    description: 'Your saved bookmarks on Nostr.',
  });

  const { user } = useCurrentUser();
  const { events, isLoading, isLoadingEvents, bookmarkedIds } = useBookmarks();

  const handleRefresh = usePageRefresh(['bookmarks']);

  return (
      <main className="">
        <PageHeader title="Bookmarks" icon={<Bookmark className="size-5" />} />

        <PullToRefresh onRefresh={handleRefresh}>
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
        </PullToRefresh>
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
