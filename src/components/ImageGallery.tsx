import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Download } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import { cn } from '@/lib/utils';
import { openUrl } from '@/lib/downloadFile';
import { Skeleton } from '@/components/ui/skeleton';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { VideoPlayer } from '@/components/VideoPlayer';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { getAvatarShape } from '@/lib/avatarShape';

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

/** Sentinel URL — pass as an image entry to render a loading spinner slot in the lightbox. */
export const LOADING_SENTINEL = '__lightbox_loading__';

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
  // Track loaded state per URL so navigating to an already-loaded neighbour
  // doesn't show the spinner again.
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());
  const markLoaded = useCallback((url: string) => {
    setLoadedUrls((prev) => { const next = new Set(prev); next.add(url); return next; });
  }, []);

  const currentUrl = images[currentIndex];
  const isLoaded = loadedUrls.has(currentUrl);
  const hasMultiple = images.length > 1;
  const canGoNext = currentIndex < images.length - 1;
  const canGoPrev = currentIndex > 0;

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

  // ── Per-image absolute positioning ────────────────────────────────────────────
  // Each image is rendered at a stable key (its URL) and positioned absolutely
  // at translateX((index - currentIndex) * 100vw + dragOffsetPx).
  // Because each slot keeps its key across navigation, the <img> element is
  // never destroyed — the browser's decoded image stays in memory, eliminating
  // the reload-on-swipe problem.
  //
  // Only images within 1 step of currentIndex are rendered to cap DOM size.

  const containerRef = useRef<HTMLDivElement>(null);
  // dragOffsetPx is mutated directly on the DOM (no React state) for 60fps feel
  const dragOffsetRef = useRef(0);

  const dragX = useRef<number | null>(null);
  const dragY = useRef<number | null>(null);
  const axis = useRef<'h' | 'v' | null>(null);
  const animating = useRef(false);
  const EASING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  const DURATION = 280;

  // Refs to each rendered slot keyed by image index
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const setSlotTransform = useCallback((idx: number, offsetPx: number, transition: string) => {
    const el = slotRefs.current.get(idx);
    if (!el) return;
    const base = (idx - currentIndex) * window.innerWidth;
    el.style.transition = transition;
    el.style.transform = `translateX(${base + offsetPx}px)`;
  }, [currentIndex]);

  // Apply current positions to all rendered slots without animation
  const snapAll = useCallback((offsetPx = 0) => {
    slotRefs.current.forEach((_, idx) => setSlotTransform(idx, offsetPx, 'none'));
  }, [setSlotTransform]);

  // When currentIndex changes (keyboard/button nav), snap all slots into position instantly
  useEffect(() => {
    dragOffsetRef.current = 0;
    snapAll(0);
  }, [currentIndex, snapAll]);



  const onTouchStart = (e: React.TouchEvent) => {
    if (animating.current) return;
    // Pinch gesture — don't start a swipe
    if (e.touches.length >= 2) { dragX.current = null; dragY.current = null; return; }
    dragX.current = e.touches[0].clientX;
    dragY.current = e.touches[0].clientY;
    axis.current = null;
    // Kill any in-flight transition
    slotRefs.current.forEach((_, idx) => setSlotTransform(idx, dragOffsetRef.current, 'none'));
  };

  // Registered via addEventListener with { passive: false } to allow preventDefault
  const onTouchMoveRef = useRef((_e: TouchEvent) => {});
  onTouchMoveRef.current = (e: TouchEvent) => {
    if (dragX.current === null || dragY.current === null || animating.current) return;
    const dx = e.touches[0].clientX - dragX.current;
    const dy = e.touches[0].clientY - dragY.current;
    if (!axis.current) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (axis.current !== 'h') return;
    e.preventDefault();
    const atEdge = (dx > 0 && !canGoPrev) || (dx < 0 && !canGoNext);
    dragOffsetRef.current = atEdge ? dx * 0.2 : dx;
    slotRefs.current.forEach((_, idx) => setSlotTransform(idx, dragOffsetRef.current, 'none'));
  };

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
      // Spring back
      slotRefs.current.forEach((_, idx) =>
        setSlotTransform(idx, 0, `transform ${DURATION}ms ${EASING}`)
      );
      dragOffsetRef.current = 0;
      return;
    }
    const dx = e.changedTouches[0].clientX - dragX.current;
    dragX.current = null; axis.current = null;

    const committed = Math.abs(dx) > window.innerWidth * 0.2;
    const goingNext = dx < 0 && canGoNext && committed;
    const goingPrev = dx > 0 && canGoPrev && committed;

    if (goingNext || goingPrev) {
      animating.current = true;
      const targetOffset = goingNext ? -window.innerWidth : window.innerWidth;
      const transition = `transform ${DURATION}ms ${EASING}`;
      slotRefs.current.forEach((_, idx) => setSlotTransform(idx, targetOffset, transition));
      setTimeout(() => {
        animating.current = false;
        dragOffsetRef.current = 0;
        if (goingNext) onNext();
        else onPrev();
      }, DURATION);
    } else {
      // Not committed — spring back
      slotRefs.current.forEach((_, idx) =>
        setSlotTransform(idx, 0, `transform ${DURATION}ms ${EASING}`)
      );
      dragOffsetRef.current = 0;
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
    openUrl(currentUrl);
  };

  // Only render the current image and its immediate neighbours
  const visibleIndices = [currentIndex - 1, currentIndex, currentIndex + 1].filter(
    (i) => i >= 0 && i < images.length,
  );

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

      {/* Per-image slots — each absolutely positioned by index offset */}
      <div className="absolute inset-0 overflow-hidden">
        {visibleIndices.map((i) => {
          const url = images[i];
          const isCurrent = i === currentIndex;
          const initialX = (i - currentIndex) * window.innerWidth;
          return (
            <div
              key={url}
              ref={(el) => {
                if (el) slotRefs.current.set(i, el);
                else slotRefs.current.delete(i);
              }}
              className={cn(
                'absolute inset-0 flex items-center justify-center will-change-transform',
                bottomBar ? 'pb-24 pt-14 px-4 sm:px-12' : 'py-6 pt-14 px-4 sm:px-12',
              )}
              style={{ transform: `translateX(${initialX}px)` }}
            >
              {isCurrent && !isLoaded && (mediaTypes?.[i] ?? 'image') === 'image' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="size-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                </div>
              )}
              <LightboxSlot
                url={url}
                type={mediaTypes?.[i] ?? 'image'}
                meta={mediaMeta?.[i]}
                isActive={isCurrent}
                isLoaded={isCurrent ? isLoaded : true}
                onLoad={markLoaded}
                onSwipeBlocked={() => { dragX.current = null; axis.current = null; }}
              />
            </div>
          );
        })}


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

const MIN_SCALE = 1;
const MAX_SCALE = 8;

/** Lightbox image with pinch/wheel zoom and pan support. */
function LightboxImage({ url, isLoaded, onLoad, onSwipeBlocked }: {
  url: string;
  isLoaded: boolean;
  onLoad: (url: string) => void;
  /** Called when a horizontal swipe is intercepted by pan (image is zoomed). */
  onSwipeBlocked?: () => void;
}) {
  const { src, onError } = useBlossomFallback(url);
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Zoom/pan state — mutated directly on DOM for 60fps
  const scale = useRef(1);
  const panX = useRef(0);
  const panY = useRef(0);

  // Pinch tracking
  const pinchStart = useRef<{ dist: number; midX: number; midY: number; scale: number; panX: number; panY: number } | null>(null);
  // Pan tracking (single finger when zoomed)
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  // Double-tap
  const lastTap = useRef(0);
  // Mouse drag when zoomed
  const mouseDrag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const handleLoaded = useCallback(() => onLoad(url), [onLoad, url]);

  // If the image is already cached, onLoad may not fire — check on mount.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) handleLoaded();
  }, [src, handleLoaded]);

  // Reset zoom when url changes
  useEffect(() => {
    scale.current = 1;
    panX.current = 0;
    panY.current = 0;
    applyTransform();
  }, [url]);

  function applyTransform(animated = false) {
    const el = wrapRef.current;
    if (!el) return;
    el.style.transition = animated ? 'transform 0.25s ease' : 'none';
    el.style.transform = `translate(${panX.current}px, ${panY.current}px) scale(${scale.current})`;
  }

  function clampPan(s = scale.current) {
    const el = imgRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const iw = el.offsetWidth * s;
    const ih = el.offsetHeight * s;
    const cw = wrap.parentElement?.offsetWidth ?? window.innerWidth;
    const ch = wrap.parentElement?.offsetHeight ?? window.innerHeight;
    const maxX = Math.max(0, (iw - cw) / 2);
    const maxY = Math.max(0, (ih - ch) / 2);
    panX.current = Math.max(-maxX, Math.min(maxX, panX.current));
    panY.current = Math.max(-maxY, Math.min(maxY, panY.current));
  }

  function dist(t: React.TouchList | TouchList) {
    const dx = t[1].clientX - t[0].clientX;
    const dy = t[1].clientY - t[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      pinchStart.current = {
        dist: dist(e.touches),
        midX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        midY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        scale: scale.current,
        panX: panX.current,
        panY: panY.current,
      };
      panStart.current = null;
    } else if (e.touches.length === 1) {
      if (scale.current > 1) {
        // Single finger pan when zoomed
        panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: panX.current, panY: panY.current };
      }
      // Double-tap to zoom
      const now = Date.now();
      if (now - lastTap.current < 300) {
        e.preventDefault();
        if (scale.current > 1) {
          scale.current = 1; panX.current = 0; panY.current = 0;
        } else {
          scale.current = 2.5;
          // Zoom toward tap point
          const rect = wrapRef.current?.getBoundingClientRect();
          if (rect) {
            const cx = e.touches[0].clientX - rect.left - rect.width / 2;
            const cy = e.touches[0].clientY - rect.top - rect.height / 2;
            panX.current = -cx * (scale.current - 1) / scale.current;
            panY.current = -cy * (scale.current - 1) / scale.current;
            clampPan();
          }
        }
        applyTransform(true);
      }
      lastTap.current = now;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && pinchStart.current) {
      e.preventDefault();
      const p = pinchStart.current;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, p.scale * dist(e.touches) / p.dist));
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      scale.current = newScale;
      panX.current = p.panX + (midX - p.midX);
      panY.current = p.panY + (midY - p.midY);
      clampPan(newScale);
      applyTransform();
    } else if (e.touches.length === 1 && panStart.current && scale.current > 1) {
      e.preventDefault();
      const p = panStart.current;
      panX.current = p.panX + (e.touches[0].clientX - p.x);
      panY.current = p.panY + (e.touches[0].clientY - p.y);
      clampPan();
      applyTransform();
      onSwipeBlocked?.();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStart.current = null;
    if (e.touches.length === 0) {
      panStart.current = null;
      // Snap back to min scale if under-pinched
      if (scale.current < MIN_SCALE) {
        scale.current = MIN_SCALE; panX.current = 0; panY.current = 0;
        applyTransform(true);
      } else {
        clampPan();
        applyTransform(true);
      }
    }
  };

  // Wheel: ctrl+wheel = zoom, plain wheel = pan when zoomed
  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      scale.current = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.current * factor));
      if (scale.current === MIN_SCALE) { panX.current = 0; panY.current = 0; }
      else clampPan();
      applyTransform();
    } else if (scale.current > 1) {
      e.preventDefault();
      panX.current -= e.deltaX;
      panY.current -= e.deltaY;
      clampPan();
      applyTransform();
    }
  };

  // Mouse drag when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale.current <= 1) return;
    e.preventDefault();
    mouseDrag.current = { x: e.clientX, y: e.clientY, panX: panX.current, panY: panY.current };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mouseDrag.current) return;
    panX.current = mouseDrag.current.panX + (e.clientX - mouseDrag.current.x);
    panY.current = mouseDrag.current.panY + (e.clientY - mouseDrag.current.y);
    clampPan();
    applyTransform();
  };
  const handleMouseUp = () => {
    if (!mouseDrag.current) return;
    mouseDrag.current = null;
    clampPan();
    applyTransform(true);
  };

  // Register non-passive touch/wheel listeners
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const tm = (e: TouchEvent) => handleTouchMove(e);
    const wh = (e: WheelEvent) => handleWheel(e);
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('wheel', wh, { passive: false });
    return () => { el.removeEventListener('touchmove', tm); el.removeEventListener('wheel', wh); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: scale.current > 1 ? 'grab' : 'default' }}
    >
      <div ref={wrapRef} style={{ transformOrigin: 'center center', willChange: 'transform', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          ref={imgRef}
          src={src}
          alt=""
          className={cn(
            'block max-w-full max-h-full object-contain select-none transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={handleLoaded}
          onError={onError}
          draggable={false}
        />
      </div>
    </div>
  );
}

/** Renders the correct player for a given media type inside a strip slot. */
function LightboxSlot({
  url,
  type,
  meta,
  isLoaded,
  onLoad,
  onSwipeBlocked,
}: {
  url: string;
  type: 'image' | 'video' | 'audio';
  meta?: LightboxMediaMeta;
  isActive: boolean;
  isLoaded: boolean;
  onLoad: (url: string) => void;
  onSwipeBlocked?: () => void;
}) {
  const author = useAuthor(type === 'audio' ? meta?.pubkey : undefined);
  const authorMeta = author.data?.metadata;
  const fallback = meta?.pubkey ? genUserName(meta.pubkey) : '?';

  if (url === LOADING_SENTINEL) {
    return <div className="size-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />;
  }

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
          avatarShape={getAvatarShape(authorMeta)}
          className="w-full max-w-lg"
        />
      </div>
    );
  }
  return <LightboxImage url={url} isLoaded={isLoaded} onLoad={onLoad} onSwipeBlocked={onSwipeBlocked} />;
}
