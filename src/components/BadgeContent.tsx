import { useMemo } from 'react';
import { Award } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

/** Parsed NIP-58 badge definition data. */
export interface BadgeData {
  identifier: string;
  name: string;
  description?: string;
  image?: string;
  imageDimensions?: string;
  thumbs: Array<{ url: string; dimensions?: string }>;
}

/** Parse a kind 30009 badge definition event into structured data. */
export function parseBadgeDefinition(event: NostrEvent): BadgeData | null {
  if (event.kind !== 30009) return null;

  const identifier = event.tags.find(([n]) => n === 'd')?.[1];
  if (!identifier) return null;

  const name = event.tags.find(([n]) => n === 'name')?.[1] || identifier;
  const description = event.tags.find(([n]) => n === 'description')?.[1];
  const imageTag = event.tags.find(([n]) => n === 'image');
  const image = imageTag?.[1];
  const imageDimensions = imageTag?.[2];

  const thumbs: Array<{ url: string; dimensions?: string }> = [];
  for (const tag of event.tags) {
    if (tag[0] === 'thumb' && tag[1]) {
      thumbs.push({ url: tag[1], dimensions: tag[2] });
    }
  }

  return { identifier, name, description, image, imageDimensions, thumbs };
}

interface BadgeContentProps {
  event: NostrEvent;
}

/**
 * Renders a NIP-58 badge definition (kind 30009) as a large card in the feed,
 * matching the music track / podcast episode card style.
 */
export function BadgeContent({ event }: BadgeContentProps) {
  const badge = useMemo(() => parseBadgeDefinition(event), [event]);

  if (!badge) return null;

  // Use the full image for the large hero area, fall back to largest thumbnail
  const heroImage = badge.image
    ?? badge.thumbs.find((t) => t.dimensions === '512x512')?.url
    ?? badge.thumbs[0]?.url;

  return (
    <div className="mt-3 rounded-2xl border border-border overflow-hidden">
      {/* Large badge artwork */}
      {heroImage ? (
        <div className="aspect-square max-h-[280px] w-full overflow-hidden bg-secondary/10">
          <img
            src={heroImage}
            alt={badge.name}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : (
        <div className="flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent h-[140px]">
          <Award className="size-10 text-primary/20" />
        </div>
      )}

      {/* Badge info */}
      <div className="p-3.5 space-y-1.5">
        <p className="text-[15px] font-semibold leading-snug truncate">{badge.name}</p>
        {badge.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{badge.description}</p>
        )}
      </div>
    </div>
  );
}
