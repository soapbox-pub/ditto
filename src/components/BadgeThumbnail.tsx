import { useCallback } from 'react';
import { Award } from 'lucide-react';

import { pickBadgeImage, type BadgeData } from '@/lib/parseBadgeDefinition';
import { FallbackImage } from '@/components/FallbackImage';
import { useCardTilt } from '@/hooks/useCardTilt';
import { cn } from '@/lib/utils';

interface BadgeThumbnailProps {
  badge: BadgeData;
  /** Pixel size for both width and height. Default: 48 */
  size?: number;
  className?: string;
}

/**
 * Renders a badge thumbnail with appropriate image resolution for the given size.
 * Falls back to an Award icon when no image is available.
 *
 * Includes a mouse-only 3D tilt effect. Touch events are ignored so tapping
 * through to badge detail views and normal scrolling are not disrupted.
 */
export function BadgeThumbnail({ badge, size = 48, className }: BadgeThumbnailProps) {
  const thumbUrl = pickBadgeImage(badge, size);
  // Tight perspective relative to the small thumbnail makes the 3D rotation
  // clearly visible even on 28-48px elements.
  const tilt = useCardTilt(35, 1.15, size * 3);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      tilt.onPointerMove(e);
    },
    [tilt],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      tilt.onPointerLeave(e);
    },
    [tilt],
  );

  const style: React.CSSProperties = {
    ...tilt.style,
    touchAction: 'auto',
  };

  return (
    <div
      ref={tilt.ref}
      style={style}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <FallbackImage
        src={thumbUrl}
        alt={badge.name}
        className={cn('rounded-lg object-cover', className)}
        style={{ width: size, height: size }}
        loading="lazy"
        decoding="async"
        fallback={(
          <div
            className={cn(
              'rounded-lg border border-border-subtle bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center',
              className,
            )}
            style={{ width: size, height: size }}
          >
            <Award className="text-primary/30" style={{ width: size * 0.5, height: size * 0.5 }} />
          </div>
        )}
      />
    </div>
  );
}
