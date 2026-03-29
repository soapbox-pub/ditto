/**
 * PhotosFeedPage — Instagram-style grid feed for NIP-68 photo events (kind 20).
 *
 * - Follows tab: useFeed (relay pool, chronological)
 * - Global tab: useInfiniteHotFeed (sort:hot via relay.ditto.pub)
 * - Infinite-scroll justified collage via the shared MediaCollage component
 */

import type { NostrEvent } from "@nostrify/nostrify";
import { useSeoMeta } from "@unhead/react";
import { Camera } from "lucide-react";
import { lazy, Suspense, useMemo, useCallback, useState } from "react";
import { FeedEmptyState } from "@/components/FeedEmptyState";
import { KindInfoButton } from "@/components/KindInfoButton";
import {
  eventToMediaItem,
  MediaCollage,
  MediaCollageSkeleton,
} from "@/components/MediaCollage";
import { ARC_OVERHANG_PX } from "@/components/ArcBackground";
import { PageHeader } from "@/components/PageHeader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SubHeaderBar } from "@/components/SubHeaderBar";
import { TabButton } from "@/components/TabButton";
import { useLayoutOptions } from "@/contexts/LayoutContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFeed } from "@/hooks/useFeed";
import { useFeedTab } from "@/hooks/useFeedTab";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useMuteList } from "@/hooks/useMuteList";
import { usePageRefresh } from "@/hooks/usePageRefresh";
import { useInfiniteHotFeed } from "@/hooks/useTrending";
import { getExtraKindDef } from "@/lib/extraKinds";
import type { FeedItem } from "@/lib/feedUtils";
import { isEventMuted } from "@/lib/muteHelpers";
import { sidebarItemIcon } from "@/lib/sidebarItems";

const PhotoComposeModal = lazy(() => import('@/components/PhotoComposeModal').then(m => ({ default: m.PhotoComposeModal })));

const PHOTO_KIND = 20;
const photosDef = getExtraKindDef("photos")!;

type FeedTab = "follows" | "global";

// ── Page ──────────────────────────────────────────────────────────────────────

export function PhotosFeedPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();
  const [composeOpen, setComposeOpen] = useState(false);

  const [activeTab, setActiveTab] = useFeedTab<FeedTab>("photos", [
    "follows",
    "global",
  ]);

  const handleFabClick = useCallback(() => {
    setComposeOpen(true);
  }, []);

  useSeoMeta({
    title: `Photos | ${config.appName}`,
    description: "Photo posts on Nostr",
  });
  useLayoutOptions({ showFAB: true, onFabClick: handleFabClick, fabIcon: <Camera className="size-4" strokeWidth={2.5} />, hasSubHeader: true });

  // ── Follows feed (chronological) ──
  const followsQuery = useFeed("follows", { kinds: [PHOTO_KIND] });

  // ── Global feed (sort:hot) ──
  const globalQuery = useInfiniteHotFeed([PHOTO_KIND], activeTab === "global");

  const activeQuery = activeTab === "follows" ? followsQuery : globalQuery;
  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = activeQuery;

  const { scrollRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    pageCount: rawData?.pages?.length,
  });

  const handleRefresh = usePageRefresh(['feed']);

  // Flatten — follows returns { items: FeedItem[] }, global returns NostrEvent[]
  const photoEvents = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();

    const events: NostrEvent[] =
      activeTab === "follows"
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
    <>
      <main className="">
        <PageHeader title="Photos" icon={<Camera className="size-5" />}>
          <KindInfoButton
            kindDef={photosDef}
            icon={sidebarItemIcon("photos", "size-5")}
          />
        </PageHeader>

        {/* Tabs */}
        <SubHeaderBar>
          <TabButton
            label="Follows"
            active={activeTab === "follows"}
            onClick={() => setActiveTab("follows")}
            disabled={!user}
          />
          <TabButton
            label="Global"
            active={activeTab === "global"}
            onClick={() => setActiveTab("global")}
          />
        </SubHeaderBar>
        <div style={{ height: ARC_OVERHANG_PX }} />

        {/* Grid */}
        <PullToRefresh onRefresh={handleRefresh}>
          {showSkeleton ? (
            <MediaCollageSkeleton count={15} />
          ) : photoEvents.length === 0 ? (
            <FeedEmptyState
              message={
                activeTab === "follows"
                  ? "No photos yet. Follow some photographers to see their photos here."
                  : "No photos found. Check your relay connections or come back soon."
              }
              onSwitchToGlobal={
                activeTab === "follows" ? () => setActiveTab("global") : undefined
              }
            />
          ) : (
            <>
              <MediaCollage
                events={photoEvents}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onNearEnd={() => {
                  if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                }}
              />
              <div ref={scrollRef} className="h-px" />
            </>
          )}
        </PullToRefresh>
      </main>

      {composeOpen && (
        <Suspense fallback={null}>
          <PhotoComposeModal open={composeOpen} onOpenChange={setComposeOpen} />
        </Suspense>
      )}
    </>
  );
}
