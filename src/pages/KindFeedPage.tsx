import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useStreamKind } from '@/hooks/useStreamKind';

interface KindFeedPageProps {
  kind: number | number[];
  title: string;
  icon?: React.ReactNode;
  emptyMessage?: string;
}

export function KindFeedPage({ kind, title, icon, emptyMessage }: KindFeedPageProps) {
  useSeoMeta({
    title: `${title} | Mew`,
    description: `${title} on Nostr`,
  });

  const { events, isLoading } = useStreamKind(kind);

  return (
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 mt-4 mb-5">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2">
            {icon}
            <h1 className="text-xl font-bold">{title}</h1>
          </div>
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
