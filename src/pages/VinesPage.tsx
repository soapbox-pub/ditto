import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { VineCard } from '@/components/VineCard';
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
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l lg:border-r border-border min-h-screen">
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
              <VineCard key={event.id} event={event} />
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
    <div className="border-b border-border">
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <Skeleton className="w-full h-64" />
      <div className="h-3" />
    </div>
  );
}
