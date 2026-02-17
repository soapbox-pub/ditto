import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useStreamVines } from '@/hooks/useStreamVines';

export function VinesPage() {
  useSeoMeta({
    title: 'Vines | Mew',
    description: 'Short videos on Nostr',
  });

  const { vines, isLoading } = useStreamVines();

  return (
    <MainLayout hideMobileTopBar>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-3 sticky top-0 bg-background/95 backdrop-blur-md z-10 border-b border-border">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-bold">Vines</h1>
        </div>

        {/* Feed */}
        {isLoading && vines.length === 0 ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <VineSkeleton key={i} />
            ))}
          </div>
        ) : vines.length > 0 ? (
          <div>
            {vines.map((event) => (
              <NoteCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="py-16 px-8 text-center">
            <p className="text-muted-foreground">No vines yet. Check back soon!</p>
          </div>
        )}
      </main>
    </MainLayout>
  );
}

function VineSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      {/* Header: avatar + stacked name/handle — matches NoteCard layout */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      {/* Title */}
      <Skeleton className="h-4 w-48 mt-2" />
      {/* Video thumbnail */}
      <Skeleton className="w-full h-56 rounded-2xl mt-3" />
      {/* Hashtags */}
      <div className="flex gap-1.5 mt-2">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-16" />
      </div>
      {/* Actions */}
      <div className="flex items-center gap-6 mt-3 -ml-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  );
}
