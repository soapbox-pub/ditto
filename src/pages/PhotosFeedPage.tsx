/**
 * PhotosFeedPage — Instagram-style grid feed for NIP-68 photo events (kind 20).
 *
 * - Follows tab: useFeed (relay pool, chronological)
 * - Global tab: useInfiniteHotFeed (sort:hot via relay.ditto.pub)
 * - Infinite-scroll 3-column grid with blurhash placeholders
 * - Tapping a grid cell opens a Lightbox with author info + reactions baked in
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, Images, MessageCircle, Zap, MoreHorizontal } from 'lucide-react';
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
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';
import { canZap } from '@/lib/canZap';
import { ZapDialog } from '@/components/ZapDialog';
import { RepostMenu } from '@/components/RepostMenu';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { Lightbox } from '@/components/ImageGallery';

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

  const dim = first.dim?.split('x');
  const w = dim?.[0] ? parseInt(dim[0]) : undefined;
  const h = dim?.[1] ? parseInt(dim[1]) : undefined;

  return (
    <button
      className="relative aspect-square overflow-hidden bg-muted group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onClick}
      aria-label="View photo"
    >
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

      {count > 1 && (
        <div className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded p-0.5">
          <Images className="size-3.5" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-200" />
    </button>
  );
}

// ── Lightbox bottom bar (author info + reactions) ─────────────────────────────

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}

function PhotoBottomBar({ event, onCommentClick }: { event: NostrEvent; onCommentClick: () => void }) {
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey) ?? genUserName(event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const canZapAuthor = user && canZap(metadata);

  return (
    <div className="relative pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sidebar:pb-0">
      {/* Gradient scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      <div className="relative flex items-center gap-1 px-3 pt-10 pb-3 max-w-xl mx-auto">
        {/* Avatar + name */}
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link to={profileUrl} className="shrink-0">
            <Avatar className="size-7">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-white/20 text-white text-xs">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
        </ProfileHoverCard>
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link to={profileUrl} className="font-semibold text-sm text-white hover:underline truncate mr-1">
            {displayName}
          </Link>
        </ProfileHoverCard>

        {/* Actions */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          <ReactionButton
            eventId={event.id}
            eventPubkey={event.pubkey}
            eventKind={event.kind}
            reactionCount={stats?.reactions}
            filledHeart
            className="text-white hover:text-pink-400 hover:bg-white/10 p-0 [&_svg]:size-6"
          />

          <button
            className="flex items-center gap-1.5 text-white hover:text-blue-400 transition-colors"
            onClick={onCommentClick}
          >
            <MessageCircle className="size-6" />
            {!!stats?.replies && <span className="text-sm tabular-nums drop-shadow">{stats.replies}</span>}
          </button>

          <RepostMenu event={event}>
            {(isReposted: boolean) => (
              <button className={`flex items-center gap-1.5 transition-colors ${isReposted ? 'text-accent' : 'text-white hover:text-accent'}`}>
                <RepostIcon className="size-6" />
                {!!((stats?.reposts ?? 0) + (stats?.quotes ?? 0)) && (
                  <span className="text-sm tabular-nums drop-shadow">{(stats?.reposts ?? 0) + (stats?.quotes ?? 0)}</span>
                )}
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
            onClick={() => setMoreMenuOpen(true)}
          >
            <MoreHorizontal className="size-6" />
          </button>
        </div>
      </div>

      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
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

/**
 * Overlay state: which event and which image within that event.
 * imageIndex = 0 when opening from the grid; the Lightbox prev/next within
 * an event uses its own internal index cursor, so we track event-level jumps
 * with onNextEvent / onPrevEvent.
 */
interface OverlayState {
  eventIndex: number;
  imageIndex: number;
}

export function PhotosFeedPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();

  const [activeTab, setActiveTab] = useState<FeedTab>(user ? 'follows' : 'global');
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [commentsEvent, setCommentsEvent] = useState<NostrEvent | null>(null);

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

    const events: NostrEvent[] =
      activeTab === 'follows'
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

  // ── Overlay helpers ────────────────────────────────────────────────────────

  const openOverlay = useCallback((eventIndex: number) => {
    setOverlay({ eventIndex, imageIndex: 0 });
  }, []);

  const closeOverlay = useCallback(() => setOverlay(null), []);

  const goNextEvent = useCallback(() => {
    setOverlay((prev) => {
      if (!prev) return null;
      const next = prev.eventIndex + 1;
      return next < photoEvents.length ? { eventIndex: next, imageIndex: 0 } : prev;
    });
  }, [photoEvents.length]);

  const goPrevEvent = useCallback(() => {
    setOverlay((prev) => {
      if (!prev) return null;
      const next = prev.eventIndex - 1;
      return next >= 0 ? { eventIndex: next, imageIndex: 0 } : prev;
    });
  }, []);

  // Derive the image list and imetaMap for the active event
  const activeEvent = overlay !== null ? photoEvents[overlay.eventIndex] : null;
  const activePhotos = useMemo(
    () => (activeEvent ? parsePhotoImeta(activeEvent.tags) : []),
    [activeEvent],
  );
  const activeImages = useMemo(() => activePhotos.map((p) => p.url), [activePhotos]);
  const activeImetaMap = useMemo(() => {
    const map = new Map<string, { dim?: string; blurhash?: string }>();
    for (const p of activePhotos) map.set(p.url, { dim: p.dim, blurhash: p.blurhash });
    return map;
  }, [activePhotos]);

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
              <PhotoGridThumb key={event.id} event={event} onClick={() => openOverlay(i)} />
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

      {/* Photo lightbox — Lightbox extended with author info + reactions */}
      {overlay !== null && activeEvent && activeImages.length > 0 && (
        <Lightbox
          images={activeImages}
          currentIndex={overlay.imageIndex}
          onClose={closeOverlay}
          onNext={() => setOverlay((prev) => prev && { ...prev, imageIndex: Math.min(prev.imageIndex + 1, activeImages.length - 1) })}
          onPrev={() => setOverlay((prev) => prev && { ...prev, imageIndex: Math.max(prev.imageIndex - 1, 0) })}
          onNextEvent={overlay.eventIndex < photoEvents.length - 1 ? goNextEvent : undefined}
          onPrevEvent={overlay.eventIndex > 0 ? goPrevEvent : undefined}
          showDownload={true}
          topBarLeft={
            activeImages.length > 1 ? (
              <span className="text-white/80 text-sm font-medium tabular-nums">
                {overlay.imageIndex + 1} / {activeImages.length}
              </span>
            ) : undefined
          }
          bottomBar={
            <PhotoBottomBar
              event={activeEvent}
              onCommentClick={() => setCommentsEvent(activeEvent)}
            />
          }
        />
      )}

      <CommentsSheet
        event={commentsEvent ?? undefined}
        open={!!commentsEvent}
        onClose={() => setCommentsEvent(null)}
      />
    </main>
  );
}
