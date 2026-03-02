import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Download } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';

/** Minimal imeta fields needed for pre-load sizing. */
interface ImetaDimensions {
  dim?: string;
  blurhash?: string;
}

interface ImageGalleryProps {
  images: string[];
  className?: string;
  /** Max images to show in the grid (default 4). */
  maxVisible?: number;
  /** Max height for images in the grid. */
  maxGridHeight?: string;
  /**
   * Optional map from image URL to imeta metadata (dim, blurhash).
   * Used to size skeleton placeholders correctly before the image loads.
   */
  imetaMap?: Map<string, ImetaDimensions>;
}

/**
 * Image grid + full-screen lightbox gallery.
 * Clicking an image opens a cinematic overlay with prev/next navigation,
 * keyboard support (arrow keys, Escape), and swipe gestures.
 */
export function ImageGallery({
  images,
  className,
  maxVisible = 4,
  maxGridHeight = '400px',
  imetaMap,
}: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const visibleImages = images.slice(0, maxVisible);
  const overflow = images.length - maxVisible;

  const openLightbox = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLightboxIndex(index);
  };

  const closeLightbox = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setLightboxIndex(null);
  }, []);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null ? (prev + 1) % images.length : null));
  }, [images.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null ? (prev - 1 + images.length) % images.length : null));
  }, [images.length]);

  if (images.length === 0) return null;

  return (
    <>
      {/* Thumbnail grid */}
      <div
        className={cn(
          'mt-3 rounded-2xl overflow-hidden',
          visibleImages.length > 1 && 'grid grid-cols-2 gap-0.5',
          className,
        )}
      >
        {visibleImages.map((url, i) => (
          <GridImage
            key={i}
            url={url}
            index={i}
            visibleCount={visibleImages.length}
            maxGridHeight={maxGridHeight}
            overflow={i === visibleImages.length - 1 ? overflow : 0}
            onOpen={(e) => openLightbox(i, e)}
            dim={imetaMap?.get(url)?.dim}
            blurhash={imetaMap?.get(url)?.blurhash}
          />
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={goNext}
          onPrev={goPrev}
        />
      )}
    </>
  );
}

/**
 * Parses a NIP-94 `dim` string like "1280x720" into `{ width, height }`.
 * Returns undefined if the string is missing or malformed.
 */
function parseDim(dim: string | undefined): { width: number; height: number } | undefined {
  if (!dim) return undefined;
  const [w, h] = dim.split('x').map(Number);
  if (!w || !h || isNaN(w) || isNaN(h)) return undefined;
  return { width: w, height: h };
}

/** Single image tile with a blurhash/skeleton shown until the image loads. */
function GridImage({
  url,
  index,
  visibleCount,
  maxGridHeight,
  overflow,
  onOpen,
  dim,
  blurhash,
}: {
  url: string;
  index: number;
  visibleCount: number;
  maxGridHeight: string;
  overflow: number;
  onOpen: (e: React.MouseEvent) => void;
  /** NIP-94 `dim` tag value, e.g. "1280x720". Used to size the placeholder before load. */
  dim?: string;
  /** NIP-94 `blurhash` tag value. Rendered as a canvas placeholder before the image loads. */
  blurhash?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [probedAspectRatio, setProbedAspectRatio] = useState<string | undefined>(undefined);
  const imgRef = useRef<HTMLImageElement>(null);
  const { src, onError } = useBlossomFallback(url);

  // If the image is already cached by the browser, onLoad may have
  // fired before the ref was attached. Check on mount.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
      if (!dim) {
        const { naturalWidth: w, naturalHeight: h } = imgRef.current;
        if (w && h) setProbedAspectRatio(`${w} / ${h}`);
      }
    }
  }, [dim]);

  const isSingle = visibleCount === 1;

  // Derive intrinsic aspect ratio from the imeta `dim` tag, or from probed
  // naturalWidth/naturalHeight after the image loads (for images with no dim).
  const dimensions = parseDim(dim);
  const aspectRatio = dimensions ? `${dimensions.width} / ${dimensions.height}` : probedAspectRatio;

  // The button container owns all sizing so that both the placeholder and the
  // <img> can be absolutely positioned to fill it cleanly.
  //
  // - Single image with dim or probed ratio → aspect-ratio drives the height naturally, capped at 85dvh
  // - Single image without dim (loading)    → fallback min-height of 200px until probed
  // - Grid tile                             → fixed height derived from maxGridHeight
  const containerStyle: React.CSSProperties = isSingle
    ? {
        aspectRatio,
        maxHeight: '85dvh',
        minHeight: aspectRatio ? undefined : '200px',
      }
    : {
        height:
          visibleCount === 3 && index === 0
            ? maxGridHeight
            : `calc(${maxGridHeight} / 2)`,
      };

  return (
    <button
      type="button"
      className={cn(
        'relative block w-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        visibleCount === 3 && index === 0 && 'row-span-2',
      )}
      style={containerStyle}
      onClick={onOpen}
    >
      {/* Placeholder shown while the image is loading */}
      {!loaded && (
        blurhash ? (
          // Blurhash canvas fills the container via CSS — pass small integer decode
          // resolution; the canvas is stretched to 100%×100% by the style prop.
          <Blurhash
            hash={blurhash}
            width={32}
            height={32}
            resolutionX={32}
            resolutionY={32}
            punch={1}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
            }}
          />
        ) : (
          <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
        )
      )}
      <img
        ref={imgRef}
        src={src}
        alt=""
        width={dimensions?.width}
        height={dimensions?.height}
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-all duration-300 hover:scale-[1.02]',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        loading="lazy"
        onLoad={(e) => {
          setLoaded(true);
          if (!dim) {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setProbedAspectRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
            }
          }
        }}
        onError={onError}
      />
      {/* "+N" overlay on last visible image */}
      {overflow > 0 && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-[2px]">
          <span className="text-white text-2xl font-bold">+{overflow}</span>
        </div>
      )}
    </button>
  );
}

export interface LightboxProps {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  /** Custom content rendered on the left side of the top bar (replaces default counter). */
  topBarLeft?: React.ReactNode;
  /** Whether to show the download button (default true). */
  showDownload?: boolean;
  /** Max number of images before dot indicators are hidden on mobile (default 10). */
  maxDotIndicators?: number;
}

export function Lightbox({ images, currentIndex, onClose, onNext, onPrev, topBarLeft, showDownload = true, maxDotIndicators = 10 }: LightboxProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const currentUrl = images[currentIndex];
  const hasMultiple = images.length > 1;

  // Reset load state when image changes
  useEffect(() => {
    setIsLoaded(false);
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowRight':
          if (hasMultiple) onNext();
          break;
        case 'ArrowLeft':
          if (hasMultiple) onPrev();
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, onNext, onPrev, hasMultiple]);

  // Lock body scroll
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    setTouchDelta(e.touches[0].clientX - touchStart);
  };

  const handleTouchEnd = () => {
    if (Math.abs(touchDelta) > 60 && hasMultiple) {
      if (touchDelta > 0) onPrev();
      else onNext();
    }
    setTouchStart(null);
    setTouchDelta(0);
    setIsDragging(false);
  };

  // Click anywhere that isn't a button or the image itself to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Don't close if clicking on the image, a button, or inside the top bar
    if (target.tagName === 'IMG' || target.closest('button') || target.closest('[data-gallery-topbar]')) return;
    e.stopPropagation();
    e.preventDefault();
    onClose();
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const a = document.createElement('a');
    a.href = currentUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

      {/* Top bar */}
      <div data-gallery-topbar className="absolute left-0 right-0 z-10 flex items-center justify-between px-4 py-3 safe-area-inset-top">
        {/* Left side: custom content or default counter */}
        {topBarLeft !== undefined ? topBarLeft : (
          <>
            {hasMultiple && (
              <span className="text-white/80 text-sm font-medium tabular-nums">
                {currentIndex + 1} / {images.length}
              </span>
            )}
            {!hasMultiple && <span />}
          </>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          {showDownload && (
            <button
              onClick={handleDownload}
              className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              title="Open original"
            >
              <Download className="size-5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
            className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Previous button */}
      {hasMultiple && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 backdrop-blur-sm transition-all hidden sm:flex"
          title="Previous"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}

      {/* Next button */}
      {hasMultiple && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 backdrop-blur-sm transition-all hidden sm:flex"
          title="Next"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

      {/* Image — fills the entire viewport; top/bottom space is consumed by the top bar overlay */}
      <div
        className="relative z-[1] flex items-center justify-center w-full h-full"
        style={{
          transform: isDragging ? `translateX(${touchDelta}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {/* Spinner while loading */}
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}

        <LightboxImage
          key={currentUrl}
          url={currentUrl}
          isLoaded={isLoaded}
          onLoad={() => setIsLoaded(true)}
        />
      </div>

      {/* Dot indicators (mobile) */}
      {hasMultiple && images.length <= maxDotIndicators && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 sm:hidden">
          {images.map((_, i) => (
            <div
              key={i}
              className={cn(
                'rounded-full transition-all duration-200',
                i === currentIndex
                  ? 'size-2 bg-white'
                  : 'size-1.5 bg-white/40',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Lightbox image with Blossom server fallback. */
function LightboxImage({ url, isLoaded, onLoad }: { url: string; isLoaded: boolean; onLoad: () => void }) {
  const { src, onError } = useBlossomFallback(url);

  return (
    <img
      src={src}
      alt=""
      className={cn(
        'w-full h-full object-contain select-none transition-opacity duration-300',
        isLoaded ? 'opacity-100' : 'opacity-0',
      )}
      onLoad={onLoad}
      onError={onError}
      draggable={false}
    />
  );
}
