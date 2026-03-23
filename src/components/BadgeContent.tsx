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
 * Renders a NIP-58 badge definition (kind 30009) as a showcase card in the feed.
 * Features a centered badge image with a rotating spotlight effect behind it.
 */
export function BadgeContent({ event }: BadgeContentProps) {
  const badge = useMemo(() => parseBadgeDefinition(event), [event]);

  if (!badge) return null;

  const heroImage = badge.image
    ?? badge.thumbs.find((t) => t.dimensions === '512x512')?.url
    ?? badge.thumbs[0]?.url;

  return (
    <div className="mt-3">
      {/* Showcase area */}
      <div className="relative flex flex-col items-center py-8 overflow-hidden rounded-2xl bg-gradient-to-b from-secondary/40 via-background to-background">
        {/* Rotating spotlight */}
        <div
          className="absolute animate-badge-spotlight pointer-events-none"
          style={{
            width: 240,
            height: 240,
            top: '50%',
            left: '50%',
            marginTop: -120 - 12,
            marginLeft: -120,
            background: 'conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary) / 0.12) 30deg, transparent 60deg, transparent 180deg, hsl(var(--primary) / 0.08) 210deg, transparent 240deg)',
            borderRadius: '50%',
            filter: 'blur(20px)',
          }}
        />

        {/* Badge image */}
        <div className="relative z-[1]">
          {heroImage ? (
            <img
              src={heroImage}
              alt={badge.name}
              className="size-28 rounded-2xl object-cover drop-shadow-lg"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="size-28 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center">
              <Award className="size-12 text-primary/30" />
            </div>
          )}
        </div>

        {/* Badge info */}
        <div className="relative z-[1] mt-4 text-center px-6 max-w-xs">
          <p className="text-[15px] font-semibold leading-snug">{badge.name}</p>
          {badge.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{badge.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
