import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Download } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { VideoPlayer } from '@/components/VideoPlayer';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

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
  /** Forwarded to Lightbox — custom content pinned to the bottom of the overlay. */
  lightboxBottomBar?: React.ReactNode;
  /** Forwarded to Lightbox — custom left top-bar content. */
  lightboxTopBarLeft?: React.ReactNode;
  /** Controlled lightbox index (optional). When provided the component is semi-controlled. */
  lightboxIndex?: number | null;
  /** Called when the lightbox wants to open at an index. */
  onLightboxOpen?: (index: number) => void;
  /** Called when the lightbox wants to close. */
  onLightboxClose?: () => void;
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
  lightboxBottomBar,
  lightboxTopBarLeft,
  lightboxIndex: controlledIndex,
  onLightboxOpen,
  onLightboxClose,
}: ImageGalleryProps) {
  const [internalIndex, setInternalIndex] = useState<number | null>(null);

  // Support both controlled and uncontrolled lightbox index
  const lightboxIndex = controlledIndex !== undefined ? controlledIndex : internalIndex;

  const visibleImages = images.slice(0, maxVisible);
  const overflow = images.length - maxVisible;

  const openLightbox = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onLightboxOpen) onLightboxOpen(index);
    else setInternalIndex(index);
  };

  const closeLightbox = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (onLightboxClose) onLightboxClose();
    else setInternalIndex(null);
  }, [onLightboxClose]);

  const goNext = useCallback(() => {
    if (onLightboxOpen && lightboxIndex !== null && lightboxIndex !== undefined) {
      onLightboxOpen(lightboxIndex + 1 < images.length ? lightboxIndex + 1 : lightboxIndex);
    } else {
      setInternalIndex((prev) => (prev !== null ? Math.min(prev + 1, images.length - 1) : null));
    }
  }, [images.length, lightboxIndex, onLightboxOpen]);

  const goPrev = useCallback(() => {
    if (onLightboxOpen && lightboxIndex !== null && lightboxIndex !== undefined) {
      onLightboxOpen(lightboxIndex - 1 >= 0 ? lightboxIndex - 1 : lightboxIndex);
    } else {
      setInternalIndex((prev) => (prev !== null ? Math.max(prev - 1, 0) : null));
    }
  }, [lightboxIndex, onLightboxOpen]);

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
      {lightboxIndex !== null && lightboxIndex !== undefined && (
        <Lightbox
          images={images}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={goNext}
          onPrev={goPrev}
          topBarLeft={lightboxTopBarLeft}
          bottomBar={lightboxBottomBar}
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

export interface LightboxMediaMeta {
  mime?: string;
  dim?: string;
  blurhash?: string;
  avatarUrl?: string;
  avatarFallback?: string;
  /** Nostr pubkey — used by audio slot to resolve author avatar via useAuthor. */
  pubkey?: string;
}

export interface LightboxProps {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  /** Per-slot media types — 'image' | 'video' | 'audio'. Defaults to all 'image'. */
  mediaTypes?: ('image' | 'video' | 'audio')[];
  /** Per-slot NIP-94 metadata (mime, dim, blurhash). */
  mediaMeta?: LightboxMediaMeta[];
  /** Custom content rendered on the left side of the top bar (replaces default counter). */
  topBarLeft?: React.ReactNode;
  /** Whether to show the download button (default true). */
  showDownload?: boolean;
  /** Max number of images before dot indicators are hidden on mobile (default 10). */
  maxDotIndicators?: number;
  /**
   * Custom content rendered in a bar pinned to the bottom of the lightbox.
   * Use this to add author info, reactions, captions, etc.
   */
  bottomBar?: React.ReactNode;
}

export function Lightbox({ images, currentIndex, onClose, onNext, onPrev, mediaTypes, mediaMeta, topBarLeft, showDownload = true, maxDotIndicators = 10, bottomBar }: LightboxProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const currentUrl = images[currentIndex];
  const hasMultiple = images.length > 1;
  const canGoNext = currentIndex < images.length - 1;
  const canGoPrev = currentIndex > 0;

  // Reset load state when image changes
  useEffect(() => { setIsLoaded(false); }, [currentIndex]);

  // Lock body scroll
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && canGoNext) onNext();
      if (e.key === 'ArrowLeft' && canGoPrev) onPrev();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, onNext, onPrev, canGoNext, canGoPrev]);

  // ── Strip swipe ───────────────────────────────────────────────────────────────
  // 3-slot strip: [prev][current][next], each 100vw wide.
  // Strip starts translated to -100vw (showing the middle slot).
  // During drag we mutate transform directly; on release we animate to the
  // adjacent slot then call onNext/onPrev, which shifts currentIndex and the
  // useEffect below immediately resets the strip to -100vw without animation
  // so the new neighbours are in place for the next swipe.
  const containerRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const dragX = useRef<number | null>(null);
  const dragY = useRef<number | null>(null);
  const axis = useRef<'h' | 'v' | null>(null);
  const swipeCommitted = useRef(false); // true while strip is mid-swipe-commit animation
  const EASING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

  const setStrip = (pct: number, animated: boolean) => {
    const el = stripRef.current;
    if (!el) return;
    el.style.transition = animated ? `transform 0.28s ${EASING}` : 'none';
    el.style.transform = `translateX(calc(-100vw + ${pct}%))`;
  };

  // After currentIndex changes, reset strip to centre.
  // If driven by a swipe commit the strip is at ±200vw — we need to snap it
  // back to -100vw, but we must do it in the *next* frame after React has
  // painted the new neighbours into slots, otherwise the jump is visible.
  useEffect(() => {
    if (swipeCommitted.current) {
      swipeCommitted.current = false;
      requestAnimationFrame(() => setStrip(0, false));
    } else {
      setStrip(0, false);
    }
  }, [currentIndex]);

  const onTouchStart = (e: React.TouchEvent) => {
    dragX.current = e.touches[0].clientX;
    dragY.current = e.touches[0].clientY;
    axis.current = null;
    setStrip(0, false);
  };

  // Registered via addEventListener with { passive: false } to allow preventDefault
  const onTouchMoveRef = useRef((_e: TouchEvent) => {});
  onTouchMoveRef.current = (e: TouchEvent) => {
    if (dragX.current === null || dragY.current === null) return;
    const dx = e.touches[0].clientX - dragX.current;
    const dy = e.touches[0].clientY - dragY.current;
    if (!axis.current) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (axis.current !== 'h') return;
    e.preventDefault();
    const atEdge = (dx > 0 && !canGoPrev) || (dx < 0 && !canGoNext);
    const pct = (atEdge ? dx * 0.2 : dx) / window.innerWidth * 100;
    setStrip(pct, false);
  };

  // Register touchmove as non-passive so preventDefault works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => onTouchMoveRef.current(e);
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragX.current === null || axis.current !== 'h') {
      dragX.current = null; axis.current = null;
      setStrip(0, true);
      return;
    }
    const dx = e.changedTouches[0].clientX - dragX.current;
    dragX.current = null; axis.current = null;

    if (dx < -window.innerWidth * 0.2 && canGoNext) {
      const el = stripRef.current;
      if (el) {
        swipeCommitted.current = true;
        el.style.transition = `transform 0.28s ${EASING}`;
        el.style.transform = 'translateX(-200vw)';
        el.addEventListener('transitionend', () => onNext(), { once: true });
      } else { onNext(); }
    } else if (dx > window.innerWidth * 0.2 && canGoPrev) {
      const el = stripRef.current;
      if (el) {
        swipeCommitted.current = true;
        el.style.transition = `transform 0.28s ${EASING}`;
        el.style.transform = 'translateX(0vw)';
        el.addEventListener('transitionend', () => onPrev(), { once: true });
      } else { onPrev(); }
    } else {
      setStrip(0, true);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG' || target.closest('button') || target.closest('[data-gallery-topbar]')) return;
    e.stopPropagation(); e.preventDefault();
    onClose();
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const a = document.createElement('a');
    a.href = currentUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

      {/* Top bar */}
      <div data-gallery-topbar className="absolute left-0 right-0 z-10 flex items-center justify-between px-4 py-3 safe-area-inset-top">
        {topBarLeft !== undefined ? topBarLeft : (
          <>
            {hasMultiple && <span className="text-white/80 text-sm font-medium tabular-nums">{currentIndex + 1} / {images.length}</span>}
            {!hasMultiple && <span />}
          </>
        )}
        <div className="flex items-center gap-1">
          {showDownload && (
            <button onClick={handleDownload} className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors" title="Open original">
              <Download className="size-5" />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }} className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors" title="Close (Esc)">
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Prev/next buttons (desktop) */}
      {canGoPrev && (
        <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 backdrop-blur-sm transition-all hidden sm:flex" title="Previous">
          <ChevronLeft className="size-6" />
        </button>
      )}
      {canGoNext && (
        <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 backdrop-blur-sm transition-all hidden sm:flex" title="Next">
          <ChevronRight className="size-6" />
        </button>
      )}

      {/* Media strip */}
      <div
        ref={stripRef}
        className="absolute inset-y-0 flex will-change-transform"
        style={{ width: '300vw', left: 0, transform: 'translateX(-100vw)' }}
      >
        <div className={cn('w-screen h-full flex items-center justify-center shrink-0 px-4 pt-14 sm:px-12', bottomBar ? 'pb-24' : 'pb-6')}>
          {canGoPrev && (
            <LightboxSlot
              url={images[currentIndex - 1]}
              type={mediaTypes?.[currentIndex - 1] ?? 'image'}
              meta={mediaMeta?.[currentIndex - 1]}
              isActive={false}
              isLoaded={true}
              onLoad={() => {}}
            />
          )}
        </div>
        <div className={cn('w-screen h-full flex items-center justify-center shrink-0 px-4 pt-14 sm:px-12 relative', bottomBar ? 'pb-24' : 'pb-6')}>
          {!isLoaded && (mediaTypes?.[currentIndex] ?? 'image') === 'image' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="size-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            </div>
          )}
          <LightboxSlot
            key={currentUrl}
            url={currentUrl}
            type={mediaTypes?.[currentIndex] ?? 'image'}
            meta={mediaMeta?.[currentIndex]}
            isActive={true}
            isLoaded={isLoaded}
            onLoad={() => setIsLoaded(true)}
          />
        </div>
        <div className={cn('w-screen h-full flex items-center justify-center shrink-0 px-4 pt-14 sm:px-12', bottomBar ? 'pb-24' : 'pb-6')}>
          {canGoNext && (
            <LightboxSlot
              url={images[currentIndex + 1]}
              type={mediaTypes?.[currentIndex + 1] ?? 'image'}
              meta={mediaMeta?.[currentIndex + 1]}
              isActive={false}
              isLoaded={true}
              onLoad={() => {}}
            />
          )}
        </div>
      </div>

      {/* Dot indicators */}
      {hasMultiple && images.length <= maxDotIndicators && (
        <div className={cn('absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 sm:hidden', bottomBar ? 'bottom-20' : 'bottom-6')}>
          {images.map((_, i) => (
            <div key={i} className={cn('rounded-full transition-all duration-200', i === currentIndex ? 'size-2 bg-white' : 'size-1.5 bg-white/40')} />
          ))}
        </div>
      )}

      {/* Bottom bar — author info, reactions, captions, etc. */}
      {bottomBar && (
        <div className="absolute inset-x-0 bottom-0 z-10" onClick={(e) => e.stopPropagation()}>
          {bottomBar}
        </div>
      )}
    </div>
  );
}

/** Lightbox image with Blossom server fallback. */
function LightboxImage({ url, isLoaded, onLoad }: { url: string; isLoaded: boolean; onLoad: () => void }) {
  const { src, onError } = useBlossomFallback(url);
  const imgRef = useRef<HTMLImageElement>(null);

  // If the image is already cached, onLoad may not fire — check on mount.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      onLoad();
    }
  }, [src, onLoad]);

  return (
    <img
      ref={imgRef}
      src={src}
      alt=""
      className={cn(
        'max-w-full max-h-full object-contain select-none transition-opacity duration-300',
        isLoaded ? 'opacity-100' : 'opacity-0',
      )}
      onLoad={onLoad}
      onError={onError}
      draggable={false}
    />
  );
}

/** Renders the correct player for a given media type inside a strip slot. */
function LightboxSlot({
  url,
  type,
  meta,
  isLoaded,
  onLoad,
}: {
  url: string;
  type: 'image' | 'video' | 'audio';
  meta?: LightboxMediaMeta;
  isActive: boolean;
  isLoaded: boolean;
  onLoad: () => void;
}) {
  const author = useAuthor(type === 'audio' ? meta?.pubkey : undefined);
  const authorMeta = author.data?.metadata;
  const fallback = meta?.pubkey ? genUserName(meta.pubkey) : '?';

  if (type === 'video') {
    return (
      <div className="w-full flex items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        <VideoPlayer
          src={url}
          dim={meta?.dim}
          blurhash={meta?.blurhash}
          className="w-full max-w-lg"
        />
      </div>
    );
  }
  if (type === 'audio') {
    return (
      <div className="w-full flex items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        <AudioVisualizer
          src={url}
          mime={meta?.mime}
          avatarUrl={authorMeta?.picture}
          avatarFallback={fallback[0]?.toUpperCase()}
          className="w-full max-w-lg"
        />
      </div>
    );
  }
  return <LightboxImage url={url} isLoaded={isLoaded} onLoad={onLoad} />;
}
