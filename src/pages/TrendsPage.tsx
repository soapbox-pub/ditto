import { useSeoMeta } from "@unhead/react";
import { Flame, Loader2, Swords, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import { Link } from "react-router-dom";
import { NoteCard } from "@/components/NoteCard";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppContext } from "@/hooks/useAppContext";
import { useMuteList } from "@/hooks/useMuteList";
import {
  type SortMode,
  useInfiniteSortedPosts,
  useTrendingTags,
} from "@/hooks/useTrending";
import { isEventMuted } from "@/lib/muteHelpers";
import { cn } from "@/lib/utils";

export function TrendsPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Trends | ${config.appName}`,
    description: "Trending hashtags and posts on Nostr",
  });

  const [trendSort, setTrendSort] = useState<SortMode>("hot");

  const { data: trends, isLoading: trendsLoading } = useTrendingTags(true);
  const {
    data: sortedData,
    isPending: sortedPending,
    isLoading: sortedLoading,
    fetchNextPage: fetchNextSorted,
    hasNextPage: hasNextSorted,
    isFetchingNextPage: isFetchingNextSorted,
  } = useInfiniteSortedPosts(trendSort, true);
  const { muteItems } = useMuteList();

  // Flatten, deduplicate, and filter muted posts from paginated sorted results
  const sortedPosts = useMemo(() => {
    const seen = new Set<string>();
    return (
      sortedData?.pages.flat().filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        if (muteItems.length > 0 && isEventMuted(event, muteItems))
          return false;
        return true;
      }) ?? []
    );
  }, [sortedData?.pages, muteItems]);

  // Intersection observer for infinite scroll on sorted posts
  const { ref: sortedScrollRef, inView: sortedInView } = useInView({
    threshold: 0,
    rootMargin: "400px",
  });

  useEffect(() => {
    if (sortedInView && hasNextSorted && !isFetchingNextSorted) {
      fetchNextSorted();
    }
  }, [sortedInView, hasNextSorted, isFetchingNextSorted, fetchNextSorted]);

  return (
    <main className="">
      <PageHeader title="Trends" icon={<TrendingUp className="size-5" />} />

      {/* Trending Hashtags */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-lg font-bold text-foreground">Trending Hashtags</h3>
      </div>
      {trendsLoading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <TrendSkeleton key={i} />
          ))}
        </div>
      ) : trends && trends.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {trends.tags.slice(0, 5).map((trend, index) => (
            <TrendItem
              key={index}
              trend={{ tag: trend.tag, count: trend.accounts }}
            />
          ))}
        </div>
      ) : (
        <EmptyState message="No trending hashtags right now." />
      )}

      {/* Sort sub-tabs */}
      <div className="flex border-b border-border">
        <SortTabButton
          icon={<Flame className="size-4" />}
          label="Hot"
          active={trendSort === "hot"}
          onClick={() => setTrendSort("hot")}
        />
        <SortTabButton
          icon={<TrendingUp className="size-4" />}
          label="Rising"
          active={trendSort === "rising"}
          onClick={() => setTrendSort("rising")}
        />
        <SortTabButton
          icon={<Swords className="size-4" />}
          label="Controversial"
          active={trendSort === "controversial"}
          onClick={() => setTrendSort("controversial")}
        />
      </div>

      {/* Sorted posts — infinite scroll */}
      {(sortedPending || sortedLoading) && sortedPosts.length === 0 ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <PostSkeleton key={i} />
          ))}
        </div>
      ) : sortedPosts.length > 0 ? (
        <div>
          {sortedPosts.map((event) => (
            <NoteCard key={event.id} event={event} />
          ))}
          {hasNextSorted && (
            <div ref={sortedScrollRef} className="py-4">
              {isFetchingNextSorted && (
                <div className="flex justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <EmptyState message={`No ${trendSort} posts right now.`} />
      )}
    </main>
  );
}

function SortTabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 py-2.5 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors relative hover:bg-secondary/40",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {icon}
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full bg-primary" />
      )}
    </button>
  );
}

function TrendItem({ trend }: { trend: { tag: string; count: number } }) {
  return (
    <Link
      to={`/t/${encodeURIComponent(trend.tag)}`}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary transition-colors text-sm font-semibold text-foreground"
    >
      #{trend.tag}
      {trend.count > 0 && (
        <span className="text-xs text-muted-foreground font-normal">
          {trend.count}
        </span>
      )}
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-16 px-8 text-center">
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="px-4 py-3">
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
      </div>
    </div>
  );
}

function TrendSkeleton() {
  return (
    <div className="px-4 py-3.5">
      <Skeleton className="h-3 w-14 mb-1.5" />
      <Skeleton className="h-5 w-28 mb-1" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}
