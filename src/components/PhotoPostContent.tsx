import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Blurhash } from 'react-blurhash';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useIntl } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';
import { isValidBlurhash } from '@/lib/blurhash';
import { parseImetaEntries, type ImetaEntry } from '@/lib/imeta';
import { Lightbox, type LightboxMediaMeta } from '@/components/ImageGallery';
import { NoteContent } from '@/components/NoteContent';
import { MediaGate } from '@/components/MediaGate';
import { EncryptedFileNotice } from '@/components/EncryptedFileNotice';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { useDecryptedFile } from '@/hooks/useDecryptedFile';
import { useInView } from '@/hooks/useInView';

interface PhotoPostContentProps {
  event: NostrEvent;
  /** Feed cards show fewer hashtags than the detail page. */
  variant?: 'feed' | 'detail';
  /**
   * Escape the parent card's `px-4` with negative margins so the media runs
   * edge-to-edge, Instagram-style. Text below the media keeps its own padding.
   */
  fullBleed?: boolean;
}

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Parses a NIP-94 `dim` string like "1280x720" into a width/height ratio. */
function parseDimRatio(dim: string | undefined): number | undefined {
  if (!dim) return undefined;
  const [w, h] = dim.split('x').map(Number);
  if (!w || !h || isNaN(w) || isNaN(h)) return undefined;
  return w / h;
}

/**
 * Instagram feed posts crop everything into a ratio between 4:5 (portrait)
 * and 1.91:1 (landscape). The first photo's ratio (clamped to that range)
 * sizes every slide; the lightbox still shows the uncropped originals.
 */
function clampRatio(ratio: number): number {
  return Math.min(Math.max(ratio, 4 / 5), 1.91);
}

/**
 * Instagram-style renderer for NIP-68 kind 20 picture posts, shared by the
 * feed card (NoteCard) and the detail page (PostDetailPage).
 *
 * Single photo → full-width cropped image. Multiple photos → swipeable
 * carousel with a position counter, hover chevrons, and dot indicators.
 * Clicking any slide opens the full-screen lightbox.
 */
export function PhotoPostContent({ event, variant = 'feed', fullBleed = false }: PhotoPostContentProps) {
  const intl = useIntl();
  const photos = useMemo(() => parseImetaEntries(event.tags), [event.tags]);
  const title = getTag(event.tags, 'title');
  const description = event.content.trim();

  // Hide t tags already written as #hashtags in the caption text.
  const hashtags = useMemo(() => {
    const seen = new Set<string>();
    const lower = description.toLowerCase();
    const tags: string[] = [];
    for (const [n, v] of event.tags) {
      if (n !== 't' || !v || seen.has(v)) continue;
      seen.add(v);
      if (lower.includes(`#${v.toLowerCase()}`)) continue;
      tags.push(v);
    }
    return tags;
  }, [event.tags, description]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  // Probed ratio for the first photo when its imeta has no dim tag.
  const [probedRatio, setProbedRatio] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setCurrent(carouselApi.selectedScrollSnap());
    onSelect();
    carouselApi.on('select', onSelect);
    return () => {
      carouselApi.off('select', onSelect);
    };
  }, [carouselApi]);

  const lightboxMeta = useMemo<LightboxMediaMeta[]>(
    () => photos.map((p) => ({ dim: p.dim, blurhash: p.blurhash, encryption: p.encryption })),
    [photos],
  );

  if (photos.length === 0) return null;

  const firstRatio = parseDimRatio(photos[0].dim) ?? probedRatio;
  const aspectRatio = clampRatio(firstRatio ?? 1);
  const hasMultiple = photos.length > 1;

  const media = hasMultiple ? (
    <Carousel opts={{ align: 'start' }} setApi={setCarouselApi} className="w-full">
      <CarouselContent className="ml-0">
        {photos.map((photo, i) => (
          <CarouselItem key={`${photo.url}-${i}`} className="pl-0">
            <PhotoSlide
              entry={photo}
              aspectRatio={aspectRatio}
              onOpen={() => setLightboxIndex(i)}
              onProbeRatio={i === 0 ? setProbedRatio : undefined}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  ) : (
    <PhotoSlide
      entry={photos[0]}
      aspectRatio={aspectRatio}
      onOpen={() => setLightboxIndex(0)}
      onProbeRatio={setProbedRatio}
    />
  );

  return (
    <div className={cn('mt-2', fullBleed && '-mx-4')}>
      <MediaGate className={cn('mt-0', fullBleed && 'mx-4')}>
      {/* Media */}
      <div className="relative bg-muted/30">
        {media}

        {/* Position counter, Instagram-style top-right chip */}
        {hasMultiple && (
          <div className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white pointer-events-none">
            {current + 1}/{photos.length}
          </div>
        )}

        {/* Desktop chevrons — hidden at the ends, like Instagram */}
        {hasMultiple && current > 0 && (
          <button
            type="button"
            className="absolute left-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center justify-center size-8 rounded-full bg-white/90 text-black shadow-md hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={intl.formatMessage({ id: 'photoPost.prev', defaultMessage: 'Previous photo' })}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              carouselApi?.scrollPrev();
            }}
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        {hasMultiple && current < photos.length - 1 && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center justify-center size-8 rounded-full bg-white/90 text-black shadow-md hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={intl.formatMessage({ id: 'photoPost.next', defaultMessage: 'Next photo' })}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              carouselApi?.scrollNext();
            }}
          >
            <ChevronRight className="size-5" />
          </button>
        )}
      </div>

      {/* Dot indicators below the media (capped so huge galleries don't wrap) */}
      {hasMultiple && photos.length <= 10 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              className={cn(
                'size-1.5 rounded-full transition-colors',
                i === current ? 'bg-primary' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50',
              )}
              aria-label={intl.formatMessage(
                { id: 'photoPost.goTo', defaultMessage: 'Go to photo {number}' },
                { number: i + 1 },
              )}
              aria-current={i === current}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                carouselApi?.scrollTo(i);
              }}
            />
          ))}
        </div>
      )}
      </MediaGate>

      {/* Caption block — title, linkified description, remaining hashtags */}
      {(title || description || hashtags.length > 0) && (
        <div className={cn('mt-2.5 space-y-1', fullBleed && 'px-4')}>
          {title && (
            <p className="text-[15px] font-semibold leading-snug break-words">{title}</p>
          )}
          {description && (
            <div className="whitespace-pre-wrap break-words">
              <NoteContent
                event={event}
                className="text-[15px] leading-relaxed"
                disableEmbeds
                disableMediaEmbeds
              />
            </div>
          )}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
              {hashtags.slice(0, variant === 'detail' ? 8 : 5).map((tag) => (
                <Link
                  key={tag}
                  to={`/t/${encodeURIComponent(tag)}`}
                  className="text-[15px] text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full-screen lightbox with the uncropped originals */}
      {lightboxIndex !== null && (
        <Lightbox
          images={photos.map((p) => p.url)}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNext={() => setLightboxIndex((i) => (i !== null ? Math.min(i + 1, photos.length - 1) : i))}
          onPrev={() => setLightboxIndex((i) => (i !== null ? Math.max(i - 1, 0) : i))}
          mediaMeta={lightboxMeta}
        />
      )}
    </div>
  );
}

/**
 * One full-width photo cropped to the shared aspect ratio, with a blurhash
 * placeholder before load, Blossom mirror fallback, and encrypted-file
 * decryption — the carousel counterpart of ImageGallery's GridImage.
 */
function PhotoSlide({
  entry,
  aspectRatio,
  onOpen,
  onProbeRatio,
}: {
  entry: ImetaEntry;
  aspectRatio: number;
  onOpen: () => void;
  /** Set for the first slide only, when no imeta dim is available. */
  onProbeRatio?: (ratio: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const fallback = useBlossomFallback(entry.url);
  // Only decrypt slides near the viewport — same policy as GridImage.
  const { ref: inViewRef, inView } = useInView({ rootMargin: '400px', skip: !entry.encryption });
  const decrypted = useDecryptedFile(entry.url, entry.encryption, { enabled: inView });

  const src = decrypted.encrypted ? decrypted.src : fallback.src;
  const onError = decrypted.encrypted ? undefined : fallback.onError;
  const hasDim = !!parseDimRatio(entry.dim);

  // If the image was cached, onLoad may have fired before the ref attached.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setLoaded(true);
      if (!hasDim && img.naturalHeight) {
        onProbeRatio?.(img.naturalWidth / img.naturalHeight);
      }
    }
  }, [hasDim, onProbeRatio]);

  return (
    <button
      ref={inViewRef}
      type="button"
      className="relative block w-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      style={{ aspectRatio: `${aspectRatio}` }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
    >
      {!loaded && !decrypted.error && !decrypted.tooLarge && (
        isValidBlurhash(entry.blurhash) ? (
          <Blurhash
            hash={entry.blurhash}
            width={32}
            height={32}
            resolutionX={32}
            resolutionY={32}
            punch={1}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          />
        ) : (
          <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
        )
      )}
      {decrypted.error || decrypted.tooLarge ? (
        <EncryptedFileNotice
          fill
          unsupported={decrypted.unsupported}
          tooLarge={decrypted.tooLarge}
          byteSize={decrypted.byteSize}
          onDecryptAnyway={decrypted.decryptAnyway}
        />
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={entry.alt ?? ''}
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(e) => {
            setLoaded(true);
            const img = e.currentTarget;
            if (!hasDim && img.naturalWidth && img.naturalHeight) {
              onProbeRatio?.(img.naturalWidth / img.naturalHeight);
            }
          }}
          onError={onError}
        />
      )}
    </button>
  );
}
