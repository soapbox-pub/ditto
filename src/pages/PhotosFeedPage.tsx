/**
 * PhotosFeedPage — Instagram-style grid feed for NIP-68 photo events (kind 20).
 *
 * - Follows tab: useFeed (relay pool, chronological)
 * - Global tab: useInfiniteHotFeed (sort:hot via relay.ditto.pub)
 * - Infinite-scroll 3-column grid with blurhash placeholders
 * - Tapping a grid cell opens a NoteCard detail modal with prev/next navigation
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, X, Images, MessageCircle, Zap, MoreHorizontal } from 'lucide-react';
import { ReactionButton } from '@/components/ReactionButton';
import { CommentsSheet } from '@/components/CommentsSheet';
import { useSeoMeta } from '@unhead/react';
import { useInView } from 'react-intersection-observer';
import { Loader2 } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useFeed } from '@/hooks/useFeed';
import { useInfiniteHotFeed, useEventStats } from '@/hooks/useTrending';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { Skeleton } from '@/components/ui/skeleton';
import { KindInfoButton } from '@/components/KindInfoButton';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { getExtraKindDef } from '@/lib/extraKinds';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/feedUtils';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';

import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';

import { canZap } from '@/lib/canZap';
import { ZapDialog } from '@/components/ZapDialog';
import { RepostMenu } from '@/components/RepostMenu';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';

const PHOTO_KIND = 20;
const photosDef = getExtraKindDef('photos')!;

type FeedTab = 'follows' | 'global';

// ── Imeta helpers ─────────────────────────────────────────────────────────────

interface PhotoImeta {
  url: string;
  blurhash?: string;
  dim?: string;
  alt?: string;
}

/** Parse all imeta entries from a NIP-68 photo event. */
function parsePhotoImeta(tags: string[][]): PhotoImeta[] {
  const results: PhotoImeta[] = [];
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(' ');
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    if (parts.url) results.push({ url: parts.url, blurhash: parts.blurhash, dim: parts.dim, alt: parts.alt });
  }
  return results;
}

function getFirstPhoto(event: NostrEvent): PhotoImeta | undefined {
  return parsePhotoImeta(event.tags)[0];
}

// ── Photo grid thumbnail ──────────────────────────────────────────────────────

function PhotoGridThumb({ event, onClick }: { event: NostrEvent; onClick: () => void }) {
  const first = getFirstPhoto(event);
  const count = parsePhotoImeta(event.tags).length;
  const [loaded, setLoaded] = useState(false);

  if (!first) return null;

  // Parse width/height from dim tag (e.g. "3024x4032")
  const dim = first.dim?.split('x');
  const w = dim?.[0] ? parseInt(dim[0]) : undefined;
  const h = dim?.[1] ? parseInt(dim[1]) : undefined;

  return (
    <button
      className="relative aspect-square overflow-hidden bg-muted group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onClick}
      aria-label="View photo"
    >
      {/* Blurhash — always mounted, fades out once image loads */}
      {first.blurhash && (
        <Blurhash
          hash={first.blurhash}
          width="100%"
          height="100%"
          resolutionX={32}
          resolutionY={32}
          punch={1}
          className={cn('absolute inset-0 transition-opacity duration-300', loaded ? 'opacity-0' : 'opacity-100')}
          style={{ width: '100%', height: '100%' }}
        />
      )}

      <img
        src={first.url}
        alt={first.alt ?? ''}
        width={w}
        height={h}
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-[1.04]',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />

      {/* Multiple images indicator */}
      {count > 1 && (
        <div className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded p-0.5">
          <Images className="size-3.5" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-200" />
    </button>
  );
}

// ── Photo overlay card ────────────────────────────────────────────────────────

/** Single image panel with blossom fallback. */
function PhotoSlide({ photo, active }: { photo: PhotoImeta; active: boolean }) {
  const { src, onError } = useBlossomFallback(photo.url);
  const [loaded, setLoaded] = useState(false);

  const dim = photo.dim?.split('x');
  const w = dim?.[0] ? parseInt(dim[0]) : undefined;
  const h = dim?.[1] ? parseInt(dim[1]) : undefined;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Blurhash placeholder */}
      {photo.blurhash && !loaded && (
        <Blurhash
          hash={photo.blurhash}
          width={32}
          height={32}
          resolutionX={32}
          resolutionY={32}
          punch={1}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      )}
      {active && (
        <img
          src={src}
          alt={photo.alt ?? ''}
          width={w}
          height={h}
          className={cn('absolute inset-0 w-full h-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
          onLoad={() => setLoaded(true)}
          onError={onError}
          draggable={false}
        />
      )}
    </div>
  );
}

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}


/**
 * Vine-style photo card for the overlay: image fills all available height,
 * author + caption + actions in a compact strip below.
 */
function PhotoCard({ event, onCommentClick }: { event: NostrEvent; onCommentClick: () => void }) {
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey) ?? genUserName(event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const canZapAuthor = user && canZap(metadata);

  const photos = useMemo(() => parsePhotoImeta(event.tags), [event.tags]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const currentPhoto = photos[photoIndex] ?? photos[0];



  if (!currentPhoto) return null;

  return (
    <div className="group relative w-full h-full" onClick={(e) => e.stopPropagation()}>
      {/* Image fills everything */}
      <PhotoSlide photo={currentPhoto} active={true} />

      {/* Multi-image prev/next */}
      {photos.length > 1 && photoIndex > 0 && (
        <button
          className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white backdrop-blur-sm z-10"
          onClick={(e) => { e.stopPropagation(); setPhotoIndex((i) => i - 1); }}
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      {photos.length > 1 && photoIndex < photos.length - 1 && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white backdrop-blur-sm z-10"
          onClick={(e) => { e.stopPropagation(); setPhotoIndex((i) => i + 1); }}
        >
          <ChevronRight className="size-5" />
        </button>
      )}

      {/* Meta overlay — always visible on mobile, shown on hover on desktop */}
      <div className="absolute inset-x-0 bottom-0 z-10 opacity-100 sidebar:opacity-0 sidebar:group-hover:opacity-100 transition-opacity duration-200 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sidebar:pb-0">
        {/* Gradient scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

        <div className="relative flex items-center gap-1 px-3 pt-10 pb-3 max-w-xl mx-auto">
          {/* Avatar + name */}
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} onClick={(e) => e.stopPropagation()} className="shrink-0">
              <Avatar className="size-7">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-white/20 text-white text-xs">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          </ProfileHoverCard>
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} onClick={(e) => e.stopPropagation()} className="font-semibold text-sm text-white hover:underline truncate mr-1">
              {displayName}
            </Link>
          </ProfileHoverCard>

          {/* Actions */}
          <div className="flex items-center gap-3 ml-auto shrink-0">
            <ReactionButton eventId={event.id} eventPubkey={event.pubkey} eventKind={event.kind} reactionCount={stats?.reactions} filledHeart className="text-white hover:text-pink-400 hover:bg-white/10 p-0 [&_svg]:size-6" />

            <button
              className="flex items-center gap-1.5 text-white hover:text-blue-400 transition-colors"
              onClick={(e) => { e.stopPropagation(); onCommentClick(); }}
            >
              <MessageCircle className="size-6" />
              {!!stats?.replies && <span className="text-sm tabular-nums drop-shadow">{stats.replies}</span>}
            </button>

            <RepostMenu event={event}>
              {(isReposted: boolean) => (
                <button className={`flex items-center gap-1.5 transition-colors ${isReposted ? 'text-accent' : 'text-white hover:text-accent'}`}>
                  <RepostIcon className="size-6" />
                  {!!((stats?.reposts ?? 0) + (stats?.quotes ?? 0)) && <span className="text-sm tabular-nums drop-shadow">{(stats?.reposts ?? 0) + (stats?.quotes ?? 0)}</span>}
                </button>
              )}
            </RepostMenu>

            {canZapAuthor && (
              <ZapDialog target={event}>
                <button className="flex items-center gap-1.5 text-white hover:text-amber-400 transition-colors">
                  <Zap className="size-6" />
                  {!!stats?.zapAmount && <span className="text-sm tabular-nums drop-shadow">{formatSats(stats.zapAmount)}</span>}
                </button>
              </ZapDialog>
            )}

            <button
              className="text-white/80 hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); setMoreMenuOpen(true); }}
            >
              <MoreHorizontal className="size-6" />
            </button>
          </div>
        </div>
      </div>

      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
    </div>
  );
}

// ── Detail overlay ────────────────────────────────────────────────────────────

function PhotoDetailOverlay({
  events,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  events: NostrEvent[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const hasPrev = index > 0;
  const hasNext = index < events.length - 1;
  const [commentsEvent, setCommentsEvent] = useState<NostrEvent | null>(null);

  // The strip is a flex row; we translate it so the current card is centred.
  // During a drag we mutate the style directly (no React re-render) for
  // zero-jank 1:1 finger tracking, then snap/commit on release.
  const stripRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const lockedAxis = useRef<'h' | 'v' | null>(null);

  // Centred offset for a given index (each card is 100vw wide)
  const offsetFor = (i: number) => -i * 100;

  // Apply transform without transition (live drag)
  const setOffset = useCallback((pct: number, animated: boolean) => {
    const el = stripRef.current;
    if (!el) return;
    el.style.transition = animated ? 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)' : 'none';
    el.style.transform = `translateX(${pct}vw)`;
  }, []);

  // Snap strip to current index whenever index changes
  useEffect(() => {
    setOffset(offsetFor(index), true);
  }, [index, setOffset]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    lockedAxis.current = null;
    // Disable transition while dragging
    setOffset(offsetFor(index), false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!lockedAxis.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      lockedAxis.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (lockedAxis.current !== 'h') return;

    e.preventDefault();
    const base = offsetFor(index);
    const dxVw = (dx / window.innerWidth) * 100;
    // Resist at edges
    const atEdge = (dx > 0 && !hasPrev) || (dx < 0 && !hasNext);
    setOffset(base + (atEdge ? dxVw * 0.15 : dxVw), false);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || lockedAxis.current !== 'h') {
      touchStartX.current = null;
      lockedAxis.current = null;
      setOffset(offsetFor(index), true);
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    lockedAxis.current = null;

    const threshold = window.innerWidth * 0.3;
    if (dx < -threshold && hasNext) {
      // Snap to next — index update will re-snap strip
      onNext();
    } else if (dx > threshold && hasPrev) {
      onPrev();
    } else {
      // Snap back to current
      setOffset(offsetFor(index), true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm overflow-hidden"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <button
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="size-5" />
      </button>

      {hasPrev && (
        <button
          className="hidden sm:block absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Previous"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {hasNext && (
        <button
          className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

      {/* Strip: one 100vw slot per event, all rendered side-by-side */}
      <div
        ref={stripRef}
        className="flex h-full will-change-transform"
        style={{ transform: `translateX(${offsetFor(index)}vw)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {events.map((ev, i) => {
          // Only render neighbours to save memory
          if (Math.abs(i - index) > 1) {
            return <div key={ev.id} className="w-screen h-full shrink-0" />;
          }
          return (
            <div key={ev.id} className="w-screen h-full shrink-0">
              <PhotoCard event={ev} onCommentClick={() => setCommentsEvent(ev)} />
            </div>
          );
        })}
      </div>

      <CommentsSheet
        event={commentsEvent ?? undefined}
        open={!!commentsEvent}
        onClose={() => setCommentsEvent(null)}
      />
    </div>
  );
}

// ── Skeleton grid ─────────────────────────────────────────────────────────────

function PhotoGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {Array.from({ length: 15 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-none" />
      ))}
    </div>
  );
}

// ── Tab button (mirrors Feed.tsx) ─────────────────────────────────────────────

function TabButton({ label, active, onClick, disabled }: {
  label: string; active: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40 disabled:opacity-50',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PhotosFeedPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();

  const [activeTab, setActiveTab] = useState<FeedTab>(user ? 'follows' : 'global');
  const [detailIndex, setDetailIndex] = useState<number | null>(null);

  useSeoMeta({ title: `Photos | ${config.appName}`, description: 'Photo posts on Nostr' });
  useLayoutOptions({ showFAB: false });

  useEffect(() => { if (user) setActiveTab('follows'); }, [user]);

  // ── Follows feed (chronological) ──
  const followsQuery = useFeed('follows', { kinds: [PHOTO_KIND] });

  // ── Global feed (sort:hot) ──
  const globalQuery = useInfiniteHotFeed([PHOTO_KIND], activeTab === 'global');

  const activeQuery = activeTab === 'follows' ? followsQuery : globalQuery;
  const { data: rawData, isPending, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = activeQuery;

  // Auto-fetch page 2
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

  // Infinite scroll
  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten — follows returns { items: FeedItem[] }, global returns NostrEvent[]
  const photoEvents = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();

    const events: NostrEvent[] = activeTab === 'follows'
      ? (rawData.pages as unknown as { items: FeedItem[] }[])
          .flatMap((p) => p.items)
          .map((item) => item.event)
      : (rawData.pages as unknown as NostrEvent[][]).flat();

    return events.filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      if (event.kind !== PHOTO_KIND) return false;
      if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
      return !!getFirstPhoto(event);
    });
  }, [rawData?.pages, muteItems, activeTab]);

  const showSkeleton = isPending || (isLoading && !rawData);

  const openDetail = useCallback((index: number) => setDetailIndex(index), []);
  const closeDetail = useCallback(() => setDetailIndex(null), []);
  const prevDetail = useCallback(() => setDetailIndex((i) => (i !== null && i > 0 ? i - 1 : i)), []);
  const nextDetail = useCallback(() => setDetailIndex((i) => (i !== null && i < photoEvents.length - 1 ? i + 1 : i)), [photoEvents.length]);

  return (
    <main className="">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-1">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Camera className="size-5" />
          <h1 className="text-xl font-bold">Photos</h1>
        </div>
        <KindInfoButton kindDef={photosDef} icon={sidebarItemIcon('photos', 'size-5')} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
        <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => setActiveTab('follows')} disabled={!user} />
        <TabButton label="Global" active={activeTab === 'global'} onClick={() => setActiveTab('global')} />
      </div>

      {/* Grid */}
      {showSkeleton ? (
        <PhotoGridSkeleton />
      ) : photoEvents.length === 0 ? (
        <div className="py-16 px-8 text-center">
          <Camera className="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            No photos yet.
            {activeTab === 'follows'
              ? ' Follow some photographers or switch to Global.'
              : ' Check your relay connections or come back soon.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-0.5">
            {photoEvents.map((event, i) => (
              <PhotoGridThumb key={event.id} event={event} onClick={() => openDetail(i)} />
            ))}
          </div>
          <div ref={scrollRef} className="py-4">
            {isFetchingNextPage && (
              <div className="flex justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </>
      )}

      {/* Detail overlay */}
      {detailIndex !== null && (
        <PhotoDetailOverlay
          events={photoEvents}
          index={detailIndex}
          onClose={closeDetail}
          onPrev={prevDetail}
          onNext={nextDetail}
        />
      )}
    </main>
  );
}
