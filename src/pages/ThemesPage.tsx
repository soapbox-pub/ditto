import type { NostrEvent } from "@nostrify/nostrify";
import { useQueryClient } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import { Loader2, Pencil, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { FeedEmptyState } from "@/components/FeedEmptyState";
import { NoteCard } from "@/components/NoteCard";
import { PageHeader } from "@/components/PageHeader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SubHeaderBar } from "@/components/SubHeaderBar";
import { TabButton } from "@/components/TabButton";
import { ThemeSelector } from "@/components/ThemeSelector";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useLayoutOptions } from "@/contexts/LayoutContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFeedTab } from "@/hooks/useFeedTab";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useTheme } from "@/hooks/useTheme";
import { useThemeFeed } from "@/hooks/useThemeFeed";
import { deduplicateEvents } from "@/lib/deduplicateEvents";

type ThemesTab = "my-themes" | "follows" | "global";

export function ThemesPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { autoShareTheme, setAutoShareTheme } = useTheme();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useFeedTab<ThemesTab>("themes", [
    "my-themes",
    "follows",
    "global",
  ]);

  // Builder dialog state
  const [builderOpen, setBuilderOpen] = useState(false);

  useSeoMeta({
    title: `Themes | ${config.appName}`,
    description: "Browse, create, and share custom UI themes",
  });

  // FAB opens builder in "new" mode (only on My Themes tab)
  const handleFabClick = useCallback(() => {
    setBuilderOpen(true);
  }, []);

  useLayoutOptions({
    showFAB: activeTab === "my-themes",
    onFabClick: handleFabClick,
    fabIcon: <Pencil strokeWidth={3} size={16} />,
    hasSubHeader: true,
  });

  // Feed queries for follows/global tabs
  const feedTab = activeTab === "follows" ? "follows" : "global";
  const feedQuery = useThemeFeed(feedTab);

  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = feedQuery;

  const { scrollRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    pageCount: rawData?.pages?.length,
    enabled: activeTab !== "my-themes",
  });

  const feedEvents = deduplicateEvents(rawData?.pages as NostrEvent[][]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["theme-feed", feedTab] });
  }, [queryClient, feedTab]);

  const showSkeleton =
    activeTab !== "my-themes" && (isPending || (isLoading && !rawData));

  return (
    <main className="pb-16 sidebar:pb-0">
      <PageHeader title="Themes" icon={<Sparkles className="size-5" />} />

      {/* Tabs */}
      <SubHeaderBar>
        <TabButton
          label="My Themes"
          active={activeTab === "my-themes"}
          onClick={() => setActiveTab("my-themes")}
        />
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

      {/* Tab content */}
      {activeTab === "my-themes" ? (
        <div className="p-4 space-y-6">
          <ThemeSelector
            builderOpen={builderOpen}
            onBuilderOpenChange={setBuilderOpen}
          />

          {/* Sync theme toggle */}
          {user && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-4">
                <Label
                  htmlFor="auto-share-theme"
                  className="flex flex-col gap-1 cursor-pointer"
                >
                  <span className="text-sm font-medium">
                    Sync app theme with your profile theme
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">
                    Turn this off if you want to display a different theme on
                    your profile than you use in the rest of the app.
                  </span>
                </Label>
                <Switch
                  id="auto-share-theme"
                  checked={autoShareTheme}
                  onCheckedChange={setAutoShareTheme}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <PullToRefresh onRefresh={handleRefresh}>
          {showSkeleton ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <NoteCardSkeleton key={i} />
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
                activeTab === "follows"
                  ? "No themes from people you follow yet."
                  : "No themes found. Be the first to share yours!"
              }
              onSwitchToGlobal={
                activeTab === "follows"
                  ? () => setActiveTab("global")
                  : undefined
              }
            />
          )}
        </PullToRefresh>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function NoteCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex items-center gap-6 mt-3 -ml-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  );
}
