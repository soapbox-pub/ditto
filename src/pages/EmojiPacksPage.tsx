import type { NostrEvent } from '@nostrify/nostrify';
import { lazy, Suspense, useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { NoteCard } from '@/components/NoteCard';
import { PageHeader } from '@/components/PageHeader';
import { KindInfoButton } from '@/components/KindInfoButton';
import { PullToRefresh } from '@/components/PullToRefresh';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { EmojiPackManager } from '@/components/EmojiPackManager';
import { Skeleton } from '@/components/ui/skeleton';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEmojiPackFeed } from '@/hooks/useEmojiPackFeed';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { deduplicateEvents } from '@/lib/deduplicateEvents';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';

const EmojiPackDialog = lazy(() =>
  import('@/components/EmojiPackDialog').then((m) => ({ default: m.EmojiPackDialog })),
);

const emojisDef = getExtraKindDef('emojis')!;

type EmojiPacksTab = 'my-packs' | 'follows' | 'global';

/**
 * The emoji packs page. A My Packs tab manages the packs on your kind-10030
 * list; Follows/Global tabs browse published kind-30030 packs. The pack-builder
 * FAB is shown on the My Packs tab, mirroring ThemesPage.
 */
export function EmojiPacksPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  const [activeTab, setActiveTab] = useFeedTab<EmojiPacksTab>('emojis', [
    'my-packs',
    'follows',
    'global',
  ]);

  const [builderOpen, setBuilderOpen] = useState(false);

  useSeoMeta({
    title: `${emojisDef.label} | ${config.appName}`,
    description: 'Browse, collect, and create custom emoji packs',
  });

  const handleFabClick = useCallback(() => setBuilderOpen(true), []);

  useLayoutOptions({
    showFAB: activeTab === 'my-packs',
    fabKind: emojisDef.kind,
    onFabClick: handleFabClick,
    hasSubHeader: true,
  });

  const feedTab = activeTab === 'follows' ? 'follows' : 'global';
  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useEmojiPackFeed(feedTab);

  const { scrollRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    pageCount: rawData?.pages?.length,
    enabled: activeTab !== 'my-packs',
  });

  const feedEvents = deduplicateEvents(rawData?.pages as NostrEvent[][]);
  const handleRefresh = usePageRefresh(['emoji-pack-feed', feedTab]);

  const showSkeleton = activeTab !== 'my-packs' && (isPending || (isLoading && !rawData));
  const icon = sidebarItemIcon('emojis', 'size-5');

  return (
    <main className="pb-16 sidebar:pb-0">
      <PageHeader title={emojisDef.label} icon={icon} backTo="/">
        <KindInfoButton kindDef={emojisDef} icon={icon} />
      </PageHeader>

      {/* Tabs */}
      <SubHeaderBar>
        <TabButton
          label="My Packs"
          active={activeTab === 'my-packs'}
          onClick={() => setActiveTab('my-packs')}
        />
        <TabButton
          label="Follows"
          active={activeTab === 'follows'}
          onClick={() => setActiveTab('follows')}
          disabled={!user}
        />
        <TabButton
          label="Global"
          active={activeTab === 'global'}
          onClick={() => setActiveTab('global')}
        />
      </SubHeaderBar>

      {/* Arc overhang spacer (matches Feed.tsx) */}
      <div style={{ height: ARC_OVERHANG_PX }} />

      {/* Tab content */}
      {activeTab === 'my-packs' ? (
        <EmojiPackManager />
      ) : (
        <PullToRefresh onRefresh={handleRefresh}>
          {showSkeleton ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <PackCardSkeleton key={i} />
              ))}
            </div>
          ) : feedEvents.length > 0 ? (
            <div>
              {feedEvents.map((event) => (
                <NoteCard key={event.id} event={event} />
              ))}
              {hasNextPage && (
                <div ref={scrollRef} className="py-4">
                  {isFetchingNextPage && (
                    <div className="flex justify-center">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <FeedEmptyState
              message={
                activeTab === 'follows'
                  ? 'No emoji packs from people you follow yet.'
                  : 'No emoji packs found. Be the first to share one!'
              }
              onSwitchToGlobal={activeTab === 'follows' ? () => setActiveTab('global') : undefined}
            />
          )}
        </PullToRefresh>
      )}

      {builderOpen && (
        <Suspense fallback={null}>
          <EmojiPackDialog open={builderOpen} onOpenChange={setBuilderOpen} />
        </Suspense>
      )}
    </main>
  );
}

function PackCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-lg shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="size-8 rounded" />
        ))}
      </div>
    </div>
  );
}
