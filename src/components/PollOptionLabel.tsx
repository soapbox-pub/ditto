import { useState } from 'react';
import { ImageOff, Maximize2 } from 'lucide-react';
import { useIntl } from 'react-intl';

import { EmojifiedText } from '@/components/CustomEmoji';
import { Lightbox } from '@/components/ImageGallery';
import { ImetaImage } from '@/components/ImetaImage';
import { useMediaGate } from '@/components/MediaGate';
import { cn } from '@/lib/utils';
import type { PollOptionImage, PollOptionLabelParts } from '@/lib/pollOptions';

interface PollOptionImagesProps {
  images: PollOptionImage[];
  /** Fallback alt text when an image's imeta has none. */
  alt: string;
  /**
   * `thumb`: a row of small square thumbnails. `tile`: the first image filling
   * a square, edge to edge (the parent frames it), with a count chip for any
   * others.
   */
  variant?: 'thumb' | 'tile';
}

/**
 * The images a poll option's label links. While the post's {@link MediaGate}
 * is active the images aren't mounted (so never fetched); a placeholder
 * stands in for each one.
 */
export function PollOptionImages({ images, alt, variant = 'thumb' }: PollOptionImagesProps) {
  const gated = useMediaGate().active;
  const tile = variant === 'tile';
  const shown = tile ? images.slice(0, 1) : images;
  const frame = tile ? 'aspect-square w-full' : 'size-10 rounded-lg';

  return (
    <span className={cn(tile ? 'relative block' : 'flex shrink-0 gap-1')}>
      {shown.map(({ url, imeta }) => gated ? (
        <span key={url} className={cn('flex items-center justify-center bg-secondary text-muted-foreground', !tile && 'inset-well', frame)}>
          <ImageOff className={tile ? 'size-5' : 'size-4'} />
        </span>
      ) : (
        <ImetaImage
          key={url}
          src={url}
          imeta={imeta}
          alt={imeta?.alt ?? alt}
          className={cn('bg-secondary object-cover', tile ? 'object-top' : 'border border-border-subtle', frame)}
          style={tile ? { aspectRatio: '1 / 1' } : undefined}
        />
      ))}
      {tile && images.length > 1 && (
        <span className="absolute bottom-2 right-2 rounded-full bg-background/80 px-1.5 text-xs font-medium tabular-nums backdrop-blur-sm">
          +{images.length - 1}
        </span>
      )}
    </span>
  );
}

/** Grid for image-poll tiles: three across when there are exactly three. */
export function pollTileGridClass(count: number): string {
  return cn('grid gap-2', count === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2');
}

/**
 * Opens a poll option's images full screen. Rendered beside, not inside, the
 * option's button, which a tap still selects.
 */
export function PollOptionZoomButton({ images, className }: { images: PollOptionImage[]; className?: string }) {
  const intl = useIntl();
  const gated = useMediaGate().active;
  const [index, setIndex] = useState<number | null>(null);

  if (gated || images.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIndex(0);
        }}
        aria-label={intl.formatMessage({ id: 'poll.viewImage', defaultMessage: 'View image' })}
        className={cn(
          'flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Maximize2 className="size-4" />
      </button>
      {index !== null && (
        <Lightbox
          images={images.map((img) => img.url)}
          currentIndex={index}
          onClose={() => setIndex(null)}
          onNext={() => setIndex((i) => Math.min((i ?? 0) + 1, images.length - 1))}
          onPrev={() => setIndex((i) => Math.max((i ?? 0) - 1, 0))}
        />
      )}
    </>
  );
}

interface PollOptionLabelProps {
  option: PollOptionLabelParts;
  /** The poll's tags, for custom emoji. */
  tags: string[][];
}

/** A poll option's text, led by thumbnails of the images its label links. */
export function PollOptionLabel({ option, tags }: PollOptionLabelProps) {
  const { text, images } = option;

  return (
    <span className="flex min-w-0 items-center gap-2">
      {images.length > 0 && <PollOptionImages images={images} alt={text} />}
      {text && (
        <span className="min-w-0 break-words">
          <EmojifiedText tags={tags}>{text}</EmojifiedText>
        </span>
      )}
    </span>
  );
}
