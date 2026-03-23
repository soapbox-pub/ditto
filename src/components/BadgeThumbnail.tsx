import { Award } from 'lucide-react';
import type { BadgeData } from '@/components/BadgeContent';
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
 */
export function BadgeThumbnail({ badge, size = 48, className }: BadgeThumbnailProps) {
  // Pick the best image for the requested size
  const thumbUrl = pickThumb(badge, size);

  return thumbUrl ? (
    <img
      src={thumbUrl}
      alt={badge.name}
      className={cn(
        'rounded-lg object-cover',
        className,
      )}
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
    />
  ) : (
    <div
      className={cn(
        'rounded-lg border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Award className="text-primary/30" style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

/** Pick the best thumbnail or image for a target pixel size. */
function pickThumb(badge: BadgeData, targetSize: number): string | undefined {
  // Prefer exact or next-larger thumbnail
  const sorted = [...badge.thumbs].sort((a, b) => {
    const aSize = parseDimension(a.dimensions);
    const bSize = parseDimension(b.dimensions);
    return aSize - bSize;
  });

  for (const thumb of sorted) {
    const dim = parseDimension(thumb.dimensions);
    if (dim >= targetSize) return thumb.url;
  }

  // Fall back to largest thumb, then full image
  return sorted[sorted.length - 1]?.url ?? badge.image;
}

function parseDimension(dim?: string): number {
  if (!dim) return 0;
  const match = dim.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
