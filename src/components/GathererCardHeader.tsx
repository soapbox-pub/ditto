import { useCallback, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { CardsIcon } from '@/components/icons/CardsIcon';
import { LinkEmbed } from '@/components/LinkEmbed';
import { Skeleton } from '@/components/ui/skeleton';
import { Lightbox } from '@/components/ImageGallery';
import { useScryfallCard } from '@/hooks/useScryfallCard';
import { useCardTilt } from '@/hooks/useCardTilt';
import { cardPrimaryImage, type ScryfallCard, type ScryfallCardFace } from '@/lib/scryfall';
import type { GathererCard } from '@/lib/linkEmbed';
import { cn } from '@/lib/utils';

/** Max rendered width of the card image. */
const CARD_MAX_WIDTH = 280;

/** Magic cards have a printed corner radius of roughly 4.75% of their width. */
const CARD_CORNER_RADIUS = 'rounded-[4.75%]';

export function GathererCardHeader({
  card: lookup,
  url,
}: {
  card: GathererCard;
  url: string;
}) {
  const scryfallLookup = useMemo(() => (
    lookup.kind === 'multiverse'
      ? { kind: 'multiverse' as const, multiverseId: lookup.multiverseId }
      : { kind: 'set' as const, set: lookup.set, number: lookup.number, lang: lookup.lang }
  ), [lookup]);

  const { data: card, isLoading, isError } = useScryfallCard(scryfallLookup);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-4">
        <Skeleton
          className={cn('w-full aspect-[5/7]', CARD_CORNER_RADIUS)}
          style={{ maxWidth: CARD_MAX_WIDTH }}
        />
      </div>
    );
  }

  // Fallback to the generic link preview when Scryfall has no record of the
  // card (e.g. name-only searches, promos not yet indexed, API errors).
  if (isError || !card) {
    return <LinkEmbed url={url} showActions={false} />;
  }

  return <CardDisplay card={card} url={url} />;
}

function CardDisplay({ card, url }: { card: ScryfallCard; url: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [faceIndex, setFaceIndex] = useState(0);

  // Collect all display images (one per face for multi-face layouts).
  const images = useMemo(() => {
    if (card.card_faces && card.card_faces[0]?.image_uris) {
      return card.card_faces.map((f) => f.image_uris?.large).filter((s): s is string => !!s);
    }
    const primary = cardPrimaryImage(card, 'large');
    return primary ? [primary] : [];
  }, [card]);

  const faces: Array<ScryfallCardFace | ScryfallCard> = useMemo(() => {
    if (card.card_faces && card.card_faces.length > 0) return card.card_faces;
    return [card];
  }, [card]);

  const activeFace = faces[faceIndex] ?? faces[0];
  const heroImage = images[faceIndex] ?? images[0];
  const hasMultipleFaces = faces.length > 1;

  return (
    <div className="flex flex-col items-center py-4">
      {/* 3D-tilt card image */}
      <div className="w-full" style={{ maxWidth: CARD_MAX_WIDTH }}>
        {heroImage ? (
          <CardImageTilt
            src={heroImage}
            name={activeFace.name}
            onClick={() => setLightboxOpen(true)}
          />
        ) : (
          <div
            className={cn(
              'w-full aspect-[5/7] bg-secondary flex items-center justify-center',
              CARD_CORNER_RADIUS,
            )}
          >
            <CardsIcon className="size-12 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Face toggle for DFC/MDFC/split cards — essential when only the image is shown */}
      {hasMultipleFaces && (
        <div className="flex gap-1.5 mt-4">
          {faces.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setFaceIndex(i)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full transition-colors',
                i === faceIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Source links */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-4">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <CardsIcon className="size-3.5" />
          <span>View on Gatherer</span>
          <ExternalLink className="size-3" />
        </a>
        <a
          href={card.scryfall_uri}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>View on Scryfall</span>
          <ExternalLink className="size-3" />
        </a>
      </div>

      {/* Full-size image lightbox */}
      {lightboxOpen && images.length > 0 && (
        <Lightbox
          images={images}
          currentIndex={faceIndex}
          onClose={() => setLightboxOpen(false)}
          onNext={() => setFaceIndex((i) => (i + 1) % images.length)}
          onPrev={() => setFaceIndex((i) => (i - 1 + images.length) % images.length)}
          showDownload={false}
          maxDotIndicators={10}
        />
      )}
    </div>
  );
}

/**
 * Card image with a 3D tilt effect matching the badge showcase. Supports
 * mouse, pen, and touch input: on touch, press-and-drag drives the tilt,
 * while a quick tap still opens the lightbox via the inner button.
 */
function CardImageTilt({
  src,
  name,
  onClick,
}: {
  src: string;
  name: string;
  onClick: () => void;
}) {
  const tilt = useCardTilt(18, 1.04);
  const glareRef = useRef<HTMLDivElement>(null);
  const glareFadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateGlare = useCallback((clientX: number, clientY: number) => {
    const el = tilt.ref.current;
    const glare = glareRef.current;
    if (!el || !glare) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    glare.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 35%, transparent 65%)`;
    glare.style.opacity = '1';
  }, [tilt.ref]);

  const fadeGlare = useCallback(() => {
    const glare = glareRef.current;
    if (glare) glare.style.opacity = '0';
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      tilt.onPointerDown(e);
      if (e.pointerType === 'touch') {
        clearTimeout(glareFadeTimerRef.current);
        updateGlare(e.clientX, e.clientY);
      }
    },
    [tilt, updateGlare],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      tilt.onPointerMove(e);
      // Mirror useCardTilt: for touch, only update while finger is down.
      if (e.pointerType === 'touch' && !tilt.isTouchActive) return;
      updateGlare(e.clientX, e.clientY);
    },
    [tilt, updateGlare],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      tilt.onPointerUp(e);
      if (e.pointerType === 'touch') {
        clearTimeout(glareFadeTimerRef.current);
        glareFadeTimerRef.current = setTimeout(fadeGlare, 600);
      }
    },
    [tilt, fadeGlare],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      tilt.onPointerLeave(e);
      if (e.pointerType === 'touch') {
        clearTimeout(glareFadeTimerRef.current);
        glareFadeTimerRef.current = setTimeout(fadeGlare, 600);
      } else {
        fadeGlare();
      }
    },
    [tilt, fadeGlare],
  );

  // Allow vertical page scrolling to still work on touch — tilt is driven
  // by horizontal drags and brief holds.
  const style: React.CSSProperties = {
    ...tilt.style,
    touchAction: 'pan-y',
    transformStyle: 'preserve-3d',
  };

  return (
    <div
      ref={tilt.ref}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className="relative select-none"
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`View ${name} full size`}
        className={cn(
          'block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          CARD_CORNER_RADIUS,
        )}
      >
        <img
          src={src}
          alt={name}
          loading="eager"
          draggable={false}
          className={cn(
            'w-full aspect-[5/7] object-cover shadow-[0_14px_40px_-12px_rgba(0,0,0,0.45)]',
            CARD_CORNER_RADIUS,
          )}
        />
      </button>
      {/* Specular glare overlay, clipped to the card's rounded corners */}
      <div
        ref={glareRef}
        aria-hidden="true"
        className={cn(
          'absolute inset-0 pointer-events-none',
          CARD_CORNER_RADIUS,
        )}
        style={{
          opacity: 0,
          transition: 'opacity 0.4s ease-out',
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
}
