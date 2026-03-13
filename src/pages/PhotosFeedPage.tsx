/**
 * PhotosFeedPage — Instagram-style grid feed for NIP-68 photo events (kind 20).
 *
 * - Follows tab: useFeed (relay pool, chronological)
 * - Global tab: useInfiniteHotFeed (sort:hot via relay.ditto.pub)
 * - Infinite-scroll 3-column grid via the shared MediaGrid component
 */

import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { useInView } from 'react-intersection-observer';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useFeed } from '@/hooks/useFeed';
import { useInfiniteHotFeed } from '@/hooks/useTrending';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { KindInfoButton } from '@/components/KindInfoButton';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { getExtraKindDef } from '@/lib/extraKinds';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/feedUtils';
import { MediaGrid, MediaGridSkeleton, eventToMediaItem } from '@/components/MediaGrid';

const PHOTO_KIND = 20;
const photosDef = getExtraKindDef('photos')!;

type FeedTab = 'follows' | 'global';

// ── Tab button ────────────────────────────────────────────────────────────────

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

  const [activeTab, setActiveTab] = useFeedTab<FeedTab>('photos', ['follows', 'global']);

  useSeoMeta({ title: `Photos | ${config.appName}`, description: 'Photo posts on Nostr' });
  useLayoutOptions({ showFAB: false });

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
      return eventToMediaItem(event) !== null;
    });
  }, [rawData?.pages, muteItems, activeTab]);

  const showSkeleton = isPending || (isLoading && !rawData);

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
        <MediaGridSkeleton count={15} />
      ) : photoEvents.length === 0 ? (
        <FeedEmptyState
          message={
            activeTab === 'follows'
              ? 'No photos yet. Follow some photographers to see their photos here.'
              : 'No photos found. Check your relay connections or come back soon.'
          }
          onSwitchToGlobal={activeTab === 'follows' ? () => setActiveTab('global') : undefined}
        />
      ) : (
        <>
          <MediaGrid
            events={photoEvents}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onNearEnd={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
          />
          <div ref={scrollRef} className="h-px" />
        </>
      )}
    </main>
  );
}
