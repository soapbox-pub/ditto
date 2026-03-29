import { useCallback, useMemo, useRef } from 'react';
import { Award } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCardTilt } from '@/hooks/useCardTilt';

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
 * Features a centered badge image with rotating light rays radiating outward.
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
      <div className="relative isolate flex flex-col items-center py-10 overflow-hidden rounded-2xl">
        {/* Rotating light rays — outer div centers, inner div rotates */}
        <div
          className="absolute -z-10 pointer-events-none"
          aria-hidden="true"
          style={{
            width: 360,
            height: 360,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -55%)',
          }}
        >
          <div
            className="w-full h-full animate-badge-spotlight"
            style={{
              background: `repeating-conic-gradient(
                hsl(var(--primary) / 0.08) 0deg 6deg,
                transparent 6deg 18deg
              )`,
              maskImage: 'radial-gradient(circle, black 15%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(circle, black 15%, transparent 70%)',
            }}
          />
        </div>

        {/* Badge image with mouse-only 3D tilt */}
        <BadgeImageTilt heroImage={heroImage} badgeName={badge.name} />

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

/** Extra padding (px) around the badge that expands the mouse hit-area. */
const INTERACT_PAD = 48;

/**
 * Badge image with mouse-only 3D tilt. Touch events are ignored so
 * tapping through to the detail view is not interfered with.
 */
function BadgeImageTilt({ heroImage, badgeName }: { heroImage?: string; badgeName: string }) {
  const tilt = useCardTilt(25, 1.08);
  const glareRef = useRef<HTMLDivElement>(null);

  const imageMask: React.CSSProperties | undefined = heroImage ? {
    maskImage: `url(${heroImage})`,
    WebkitMaskImage: `url(${heroImage})`,
    maskSize: 'cover',
    WebkitMaskSize: 'cover',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
  } : undefined;

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      tilt.onPointerMove(e);

      const el = tilt.ref.current;
      const glare = glareRef.current;
      if (!el || !glare) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left - INTERACT_PAD) / (rect.width - INTERACT_PAD * 2)) * 100;
      const y = ((e.clientY - rect.top - INTERACT_PAD) / (rect.height - INTERACT_PAD * 2)) * 100;
      glare.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 35%, transparent 65%)`;
      glare.style.opacity = '1';
    },
    [tilt],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      tilt.onPointerLeave(e);
      const glare = glareRef.current;
      if (glare) glare.style.opacity = '0';
    },
    [tilt],
  );

  // Override touch-action back to auto so scrolling works normally on touch
  const style: React.CSSProperties = {
    ...tilt.style,
    touchAction: 'auto',
    transformStyle: 'preserve-3d',
    padding: INTERACT_PAD,
    margin: -INTERACT_PAD,
  };

  return (
    <div
      ref={tilt.ref}
      style={style}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative z-[1] select-none"
    >
      {heroImage ? (
        <img
          src={heroImage}
          alt={badgeName}
          className="size-28 rounded-2xl object-cover drop-shadow-lg"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="size-28 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center">
          <Award className="size-12 text-primary/30" />
        </div>
      )}
      {/* Specular glare overlay */}
      {heroImage && imageMask && (
        <div
          ref={glareRef}
          className="absolute pointer-events-none"
          style={{
            inset: INTERACT_PAD,
            opacity: 0,
            transition: 'opacity 0.4s ease-out',
            mixBlendMode: 'overlay',
            ...imageMask,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
