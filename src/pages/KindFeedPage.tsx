import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useStreamKind } from '@/hooks/useStreamKind';

interface KindFeedPageProps {
  kind: number;
  title: string;
  emptyMessage?: string;
}

export function KindFeedPage({ kind, title, emptyMessage }: KindFeedPageProps) {
  useSeoMeta({
    title: `${title} | Mew`,
    description: `${title} on Nostr`,
  });

  const { events, isLoading } = useStreamKind(kind);

  return (
    <MainLayout hideMobileTopBar>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-3 sticky top-0 bg-background/95 backdrop-blur-md z-10 border-b border-border">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-bold">{title}</h1>
        </div>

        {/* Feed */}
        {isLoading && events.length === 0 ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <FeedItemSkeleton key={i} />
            ))}
          </div>
        ) : events.length > 0 ? (
          <div>
            {events.map((event) => (
              <NoteCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="py-16 px-8 text-center">
            <p className="text-muted-foreground">
              {emptyMessage ?? `No ${title.toLowerCase()} yet. Check back soon!`}
            </p>
          </div>
        )}
      </main>
    </MainLayout>
  );
}

function FeedItemSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex items-center gap-6 mt-3 -ml-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  );
}
