import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { ArticleCard } from '@/components/ArticleCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useStreamKind } from '@/hooks/useStreamKind';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';

interface ArticlesFeedPageProps {
  /** Optional tag filter (e.g., "zapcooking" for recipes) */
  tagFilter?: string;
  title: string;
  icon?: React.ReactNode;
  description?: string;
}

export function ArticlesFeedPage({ tagFilter, title, icon, description }: ArticlesFeedPageProps) {
  useSeoMeta({
    title: `${title} | Mew`,
    description: description || `${title} on Nostr`,
  });

  const { events, isLoading } = useStreamKind(30023);

  // Filter by tag if specified
  const filteredEvents = tagFilter
    ? events.filter((event) => 
        event.tags.some(([name, value]) => 
          name === 't' && value.toLowerCase().includes(tagFilter.toLowerCase())
        )
      )
    : events;

  return (
    <MainLayout>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        {/* Header */}
        <div className={cn(STICKY_HEADER_CLASS, 'flex items-center gap-4 px-4 mt-4 mb-5 bg-background/95 backdrop-blur-md z-10')}>
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2">
            {icon}
            <div>
              <h1 className="text-xl font-bold">{title}</h1>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
        </div>

        {/* Feed */}
        {isLoading && filteredEvents.length === 0 ? (
          <div className="space-y-4 px-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <ArticleSkeleton key={i} />
            ))}
          </div>
        ) : filteredEvents.length > 0 ? (
          <div className="space-y-4 px-4 pb-8">
            {filteredEvents.map((event) => (
              <ArticleCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="px-4">
            <Card className="border-dashed">
              <CardContent className="py-16 px-8 text-center">
                <div className="max-w-sm mx-auto space-y-3">
                  <p className="text-muted-foreground">
                    {tagFilter 
                      ? `No ${title.toLowerCase()} found yet. Check back soon!`
                      : 'No articles found yet. Check back soon!'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </MainLayout>
  );
}

function ArticleSkeleton() {
  return (
    <Card className="border-border">
      <CardContent className="p-0">
        {/* Image skeleton */}
        <Skeleton className="aspect-[2/1] w-full rounded-t-lg" />
        
        <div className="p-4 space-y-3">
          {/* Author skeleton */}
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-full shrink-0" />
            <Skeleton className="h-4 w-24" />
          </div>

          {/* Title skeleton */}
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-7 w-3/5" />

          {/* Summary skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>

          {/* Hashtags skeleton */}
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-14" />
          </div>

          {/* Footer skeleton */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Skeleton className="h-4 w-24" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
