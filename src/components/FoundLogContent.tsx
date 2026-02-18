import { useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NostrEvent } from '@nostrify/nostrify';

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function getAllTags(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(([, v]) => v);
}

/** Renders the content of a found log event (kind 7516). */
export function FoundLogContent({ event }: { event: NostrEvent }) {
  const text = event.content;
  const images = getAllTags(event.tags, 'image');
  const hasVerification = !!getTag(event.tags, 'verification');

  // Extract geocache name from the `a` tag if available
  const geocacheRef = useMemo(() => {
    const aTag = getTag(event.tags, 'a');
    if (!aTag) return null;
    const [, , dTag] = aTag.split(':');
    return dTag ?? null;
  }, [event.tags]);

  return (
    <div className="mt-2">
      {/* Geocache reference + verified badge */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {geocacheRef && (
          <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
            {geocacheRef}
          </Badge>
        )}
        {hasVerification && (
          <Badge variant="secondary" className="text-[11px] gap-1 font-medium text-green-600 dark:text-green-400">
            <ShieldCheck className="size-3" />
            Verified
          </Badge>
        )}
      </div>

      {/* Log text */}
      {text && (
        <p className="text-[15px] leading-relaxed text-foreground/90 line-clamp-4">
          {text}
        </p>
      )}

      {/* Image */}
      {images.length > 0 && (
        <div className="mt-3 rounded-2xl overflow-hidden">
          <img
            src={images[0]}
            alt="Found log"
            className="w-full max-h-[300px] object-cover"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
