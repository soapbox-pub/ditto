import { Star, ExternalLink } from 'lucide-react';

import { useWikipediaFeatured } from '@/hooks/useWikipediaFeatured';
import { Skeleton } from '@/components/ui/skeleton';

/** Wikipedia widget showing today's featured article. */
export function WikipediaWidget() {
  const { data: feed, isLoading } = useWikipediaFeatured();

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="w-full aspect-[16/9] rounded-lg" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    );
  }

  const tfa = feed?.tfa;
  if (!tfa) {
    return <p className="text-sm text-muted-foreground p-1">No featured article today.</p>;
  }

  const imageUrl = tfa.originalimage?.source ?? tfa.thumbnail?.source;
  const excerpt = tfa.extract.length > 200 ? tfa.extract.slice(0, 200) + '...' : tfa.extract;

  return (
    <a
      href={tfa.content_urls.desktop.page}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      {/* Image */}
      {imageUrl && (
        <div className="relative aspect-[16/9] rounded-lg overflow-hidden bg-gradient-to-br from-amber-500/10 to-orange-500/10 mb-2">
          <img
            src={imageUrl}
            alt={tfa.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Content */}
      <div className="space-y-1 px-0.5">
        <div className="flex items-start gap-1.5">
          <Star className="size-3 text-amber-500 shrink-0 mt-0.5" />
          <h3 className="text-sm font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2">
            {tfa.title}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {excerpt}
        </p>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 pt-0.5">
          <ExternalLink className="size-2.5" />
          <span>Wikipedia</span>
        </div>
      </div>
    </a>
  );
}
