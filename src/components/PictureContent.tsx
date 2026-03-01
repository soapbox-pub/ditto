import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { NoteContent } from '@/components/NoteContent';
import { ImageGallery } from '@/components/ImageGallery';
import { cn } from '@/lib/utils';

/** Parsed imeta entry for a picture. */
interface PictureImeta {
  url: string;
  dim?: string;
  blurhash?: string;
  alt?: string;
}

/** Extract all image entries from NIP-68 imeta tags. */
function parsePictureImeta(tags: string[][]): PictureImeta[] {
  const images: PictureImeta[] = [];
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const entry: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i];
      const spaceIdx = part.indexOf(' ');
      if (spaceIdx === -1) continue;
      const key = part.slice(0, spaceIdx);
      const value = part.slice(spaceIdx + 1);
      entry[key] = value;
    }
    // Only include image MIME types (or entries without explicit MIME that have a URL)
    const mime = entry.m ?? '';
    const isImage = !mime || mime.startsWith('image/');
    if (entry.url && isImage) {
      images.push({
        url: entry.url,
        dim: entry.dim,
        blurhash: entry.blurhash,
        alt: entry.alt,
      });
    }
  }
  return images;
}

interface PictureContentProps {
  event: NostrEvent;
  /** If true, render in compact preview mode (for NoteCard). */
  compact?: boolean;
  className?: string;
}

/**
 * Renders NIP-68 picture events (kind 20).
 *
 * Displays a title heading, caption text (via NoteContent for link/hashtag parsing),
 * image gallery with lightbox support, and optional location tag.
 */
export function PictureContent({ event, compact, className }: PictureContentProps) {
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const location = event.tags.find(([name]) => name === 'location')?.[1];
  const hasCaption = event.content.trim().length > 0;

  // Extract images from imeta tags
  const images = useMemo(() => parsePictureImeta(event.tags), [event.tags]);
  const imageUrls = useMemo(() => images.map((img) => img.url), [images]);

  // Build imeta dimensions map for ImageGallery blurhash/sizing
  const imetaMap = useMemo(() => {
    const map = new Map<string, { dim?: string; blurhash?: string }>();
    for (const img of images) {
      if (img.dim || img.blurhash) {
        map.set(img.url, { dim: img.dim, blurhash: img.blurhash });
      }
    }
    return map;
  }, [images]);

  if (imageUrls.length === 0) return null;

  return (
    <div className={cn('mt-2', className)}>
      {/* Title */}
      {title && (
        <h3 className="text-[15px] font-semibold leading-snug mb-1">{title}</h3>
      )}

      {/* Caption */}
      {hasCaption && (
        <div className="mb-2">
          <NoteContent event={event} className="text-[15px] leading-relaxed" />
        </div>
      )}

      {/* Image gallery */}
      <ImageGallery
        images={imageUrls}
        imetaMap={imetaMap}
        maxVisible={compact ? 4 : 6}
      />

      {/* Location */}
      {location && (
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{location}</span>
        </div>
      )}
    </div>
  );
}
