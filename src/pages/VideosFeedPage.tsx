/**
 * VideosFeedPage — unified video + stream feed.
 *
 *  ┌─ Follows | Global tabs ─────────────────────┐
 *  ├─ Live Now horizontal strip (live-only) ──────┤
 *  ├─ Videos (kind 21) grid ──────────────────────┤
 *  ├─ Shorts (kind 22) — inline snap-scroll ──────┤
 *  │  (exactly like VinesFeedPage, within column) │
 *  └──────────────────────────────────────────────┘
 *
 * Global: sort:hot (ditto relay, limit 8/page)
 * Follows: chronological (useFeed, limit 8/page via PAGE_SIZE override)
 * Streams: live-only query, limit 10
 */

import type { NostrEvent } from "@nostrify/nostrify";
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import { Eye, Film, Play, Radio } from "lucide-react";
import { nip19 } from "nostr-tools";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Blurhash } from "react-blurhash";
import { Link } from "react-router-dom";
import { ARC_OVERHANG_PX } from "@/components/ArcBackground";
import { FeedEmptyState } from "@/components/FeedEmptyState";
import { KindInfoButton } from "@/components/KindInfoButton";
import { PageHeader } from "@/components/PageHeader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SubHeaderBar } from "@/components/SubHeaderBar";
import { TabButton } from "@/components/TabButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideoThumbnail } from "@/components/VideoPlayer";
import { useLayoutOptions } from "@/contexts/LayoutContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFeed } from "@/hooks/useFeed";
import { useFeedTab } from "@/hooks/useFeedTab";
import { useFollowList } from "@/hooks/useFollowActions";
import { useMuteList } from "@/hooks/useMuteList";
import { useOpenPost } from "@/hooks/useOpenPost";
import { useProfileUrl } from "@/hooks/useProfileUrl";
import { usePageRefresh } from "@/hooks/usePageRefresh";
import { useInfiniteHotFeed } from "@/hooks/useTrending";
import { getAvatarShape } from "@/lib/avatarShape";
import { getExtraKindDef } from "@/lib/extraKinds";
import type { FeedItem } from "@/lib/feedUtils";
import { getDisplayName } from "@/lib/getDisplayName";
import { isEventMuted } from "@/lib/muteHelpers";
import { sidebarItemIcon } from "@/lib/sidebarItems";
import { getEffectiveStreamStatus } from "@/lib/streamStatus";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";

// Reuse the real VineCard — no re-implementation
import { VineCard } from "@/pages/VinesFeedPage";

const videosDef = getExtraKindDef("videos")!;

/** Items per page for video feeds — enough to fill the horizontal row with overflow. */
const VIDEO_PAGE_SIZE = 12;

type FeedTab = "follows" | "global";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function parseVideoImeta(tags: string[][]): {
  url?: string;
  thumbnail?: string;
  duration?: string;
  blurhash?: string;
} {
  // Standalone fallback tags (checked after imeta)
  const standaloneThumb = getTag(tags, "thumb") ?? getTag(tags, "image");

  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(" ");
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    if (parts.url) {
      return {
        url: parts.url,
        // imeta uses "image" key for thumbnail; fall back to standalone tags
        thumbnail: parts.image ?? parts.thumb ?? standaloneThumb,
        duration: parts.duration,
        blurhash: parts.blurhash,
      };
    }
  }
  return { url: getTag(tags, "url"), thumbnail: standaloneThumb };
}

function fmtDuration(s: string | undefined): string | undefined {
  const n = parseFloat(s ?? "");
  if (isNaN(n) || n <= 0) return undefined;
  const h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60),
    sec = Math.floor(n % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ── Drag-to-scroll + edge-hover-scroll for horizontal strips ─────────────────

const EDGE_SIZE = 64; // px from edge that triggers auto-scroll
const EDGE_SPEED = 8; // px per animation frame

function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const edgeDir = useRef<-1 | 0 | 1>(0);

  // Edge auto-scroll loop
  const startEdgeScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    const tick = () => {
      const el = ref.current;
      if (el && edgeDir.current !== 0) {
        el.scrollLeft += edgeDir.current * EDGE_SPEED;
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopEdgeScroll = useCallback(() => {
    edgeDir.current = 0;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      dragging.current = true;
      startX.current = e.pageX - el.offsetLeft;
      scrollLeftRef.current = el.scrollLeft;
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
      stopEdgeScroll();
    },
    [stopEdgeScroll],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el) return;

      if (dragging.current) {
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        el.scrollLeft = scrollLeftRef.current - (x - startX.current);
        return;
      }

      // Edge detection: x relative to the element's bounding box
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < EDGE_SIZE) {
        edgeDir.current = -1;
        startEdgeScroll();
      } else if (x > rect.width - EDGE_SIZE) {
        edgeDir.current = 1;
        startEdgeScroll();
      } else {
        stopEdgeScroll();
      }
    },
    [startEdgeScroll, stopEdgeScroll],
  );

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    if (ref.current) {
      ref.current.style.cursor = "grab";
      ref.current.style.userSelect = "";
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    dragging.current = false;
    if (ref.current) {
      ref.current.style.cursor = "grab";
      ref.current.style.userSelect = "";
    }
    stopEdgeScroll();
  }, [stopEdgeScroll]);

  // Clean up on unmount
  useEffect(() => () => stopEdgeScroll(), [stopEdgeScroll]);

  return { ref, onMouseDown, onMouseMove, onMouseUp, onMouseLeave };
}

// ── Video grid card (kind 21) — YouTube-style ────────────────────────────────

function VideoGridCard({ event }: { event: NostrEvent }) {
  const {
    url,
    thumbnail: imetaThumb,
    duration,
    blurhash,
  } = parseVideoImeta(event.tags);
  const title =
    getTag(event.tags, "title") ?? (event.content.slice(0, 120) || "Untitled");
  const dur = fmtDuration(duration);
  const generatedThumb = useVideoThumbnail(url ?? "", imetaThumb);
  const thumbnail = imetaThumb ?? generatedThumb;

  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  const noteId = nip19.noteEncode(event.id);
  const { onClick, onAuxClick } = useOpenPost(`/${noteId}`);

  return (
    <div
      className="cursor-pointer group"
      onClick={onClick}
      onAuxClick={onAuxClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        {blurhash && (
          <Blurhash
            hash={blurhash}
            width="100%"
            height="100%"
            resolutionX={32}
            resolutionY={32}
            punch={1}
            className="absolute inset-0"
            style={{ width: "100%", height: "100%" }}
          />
        )}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="size-8 text-muted-foreground/20" />
          </div>
        )}
        {dur && (
          <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none">
            {dur}
          </div>
        )}
      </div>

      {/* Info row: avatar | title + channel + time */}
      <div className="mt-2.5 flex gap-2.5">
        <Link
          to={profileUrl}
          className="shrink-0 mt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {author.isLoading ? (
            <Skeleton className="size-8 rounded-full" />
          ) : (
            <Avatar shape={avatarShape} className="size-8">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-medium leading-snug line-clamp-2 mb-1">
            {title}
          </h3>
          {author.isLoading ? (
            <Skeleton className="h-2.5 w-20 mb-1" />
          ) : (
            <Link
              to={profileUrl}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors block truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {displayName}
            </Link>
          )}
          <p className="text-[11px] text-muted-foreground">
            {timeAgo(event.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

function VideoSkeleton() {
  return (
    <div>
      <Skeleton className="w-full aspect-video rounded-xl" />
      <div className="mt-2.5 flex gap-2.5">
        <Skeleton className="size-8 rounded-full shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1.5 pt-0.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
    </div>
  );
}

// ── Live streams — fetch all statuses, classify with NIP-53 staleness heuristic ─

type StreamTab = "live" | "planned" | "past";

interface ClassifiedStreams {
  live: NostrEvent[];
  planned: NostrEvent[];
  past: NostrEvent[];
}

/**
 * Fetch ALL streams globally (no author filter) so every tab sees the same
 * event versions from the relay.  The follows tab filters client-side.
 *
 * We use a large limit because kind 30311 is addressable — relays store at
 * most one event per pubkey+d-tag, so 200 means ~200 unique streams.
 * Not all relays support filtering by custom tags like `#status`, so we
 * fetch broadly and classify entirely client-side.
 */
function useAllStreams(): { data: NostrEvent[]; isLoading: boolean } {
  const { nostr } = useNostr();

  const query = useQuery<NostrEvent[]>({
    queryKey: ["all-streams"],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [30311], limit: 200 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      // Deduplicate addressable events: keep the newest per pubkey+d-tag.
      const best = new Map<string, NostrEvent>();
      for (const e of events) {
        const d = e.tags.find(([n]) => n === "d")?.[1] ?? "";
        const key = `${e.pubkey}:${d}`;
        const existing = best.get(key);
        if (!existing || e.created_at > existing.created_at) {
          best.set(key, e);
        }
      }
      return Array.from(best.values());
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  return { data: query.data ?? [], isLoading: query.isLoading };
}

/** Classify a list of stream events into live / planned / past buckets. */
function classifyStreams(events: NostrEvent[]): ClassifiedStreams {
  const buckets: ClassifiedStreams = { live: [], planned: [], past: [] };
  const byNewest = (a: NostrEvent, b: NostrEvent) =>
    b.created_at - a.created_at;
  for (const e of events) {
    const status = getEffectiveStreamStatus(e);
    if (status === "live") buckets.live.push(e);
    else if (status === "planned") buckets.planned.push(e);
    else buckets.past.push(e);
  }
  buckets.live.sort(byNewest);
  buckets.planned.sort(byNewest);
  buckets.past.sort(byNewest);
  return buckets;
}

/**
 * Returns classified streams for the given tab.
 * Global: all streams.  Follows: only streams from followed authors.
 */
function useClassifiedStreams(tab: FeedTab): {
  data: ClassifiedStreams;
  isLoading: boolean;
} {
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const followedPubkeys = followData?.pubkeys;

  const { data: allEvents, isLoading } = useAllStreams();

  const classified = useMemo<ClassifiedStreams>(() => {
    if (tab === "global") return classifyStreams(allEvents);

    // Follows tab — filter to followed authors + self, client-side.
    // Check both the event publisher AND p-tag participants, because
    // streaming services (e.g. streamstr.net) publish kind 30311 on behalf
    // of the streamer, who appears in a p tag with role "host".
    if (!followedPubkeys || !user) return { live: [], planned: [], past: [] };
    const authorSet = new Set([...followedPubkeys, user.pubkey]);
    return classifyStreams(
      allEvents.filter((e) => {
        if (authorSet.has(e.pubkey)) return true;
        return e.tags.some(([name, pk]) => name === "p" && authorSet.has(pk));
      }),
    );
  }, [allEvents, tab, followedPubkeys, user]);

  return { data: classified, isLoading };
}

function StreamBadge({ status }: { status: string }) {
  switch (status) {
    case "live":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">
          <span className="size-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
      );
    case "planned":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-600/90 text-white px-1.5 py-0.5 rounded">
          PLANNED
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-black/60 text-white/80 px-1.5 py-0.5 rounded">
          ENDED
        </span>
      );
  }
}

function LiveStreamCard({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, "title") || "Untitled Stream";
  const imageUrl = getTag(event.tags, "image");
  const viewers = getTag(event.tags, "current_participants");
  const effectiveStatus = getEffectiveStreamStatus(event);

  const naddrId = useMemo(() => {
    const d = getTag(event.tags, "d") || "";
    return nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: d,
    });
  }, [event]);

  const { onClick, onAuxClick } = useOpenPost(`/${naddrId}`);
  const author = useAuthor(event.pubkey);
  const meta = author.data?.metadata;
  const displayName = getDisplayName(meta, event.pubkey);

  return (
    <div
      className="cursor-pointer group shrink-0 w-40"
      onClick={onClick}
      onAuxClick={onAuxClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div
            className={cn(
              "w-full h-full flex items-center justify-center bg-gradient-to-br to-muted",
              effectiveStatus === "live"
                ? "from-red-950/40"
                : effectiveStatus === "planned"
                  ? "from-blue-950/40"
                  : "from-muted-foreground/10",
            )}
          >
            <Radio
              className={cn(
                "size-5",
                effectiveStatus === "live"
                  ? "text-red-400/60"
                  : "text-muted-foreground/40",
              )}
            />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <StreamBadge status={effectiveStatus} />
        </div>
        {viewers && effectiveStatus === "live" && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded">
            <Eye className="size-2.5" />
            {viewers}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs font-medium line-clamp-2 leading-snug group-hover:text-primary transition-colors">
        {title}
      </p>
      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
        {displayName}
      </p>
    </div>
  );
}

function LiveStreamsStrip({ tab }: { tab: FeedTab }) {
  const { data: streams } = useClassifiedStreams(tab);
  const [streamTab, setStreamTab] = useState<StreamTab>("live");
  const drag = useDragScroll<HTMLDivElement>();

  const totalCount =
    streams.live.length + streams.planned.length + streams.past.length;
  if (totalCount === 0) return null;

  // Auto-select first non-empty tab if current tab is empty
  const activeTab =
    streams[streamTab].length > 0
      ? streamTab
      : streams.live.length > 0
        ? "live"
        : streams.planned.length > 0
          ? "planned"
          : "past";

  const activeEvents = streams[activeTab];

  return (
    <div className="px-4 pt-3 pb-4">
      {/* Stream tab pills */}
      <div className="flex items-center gap-1.5 mb-2.5">
        {streams.live.length > 0 && (
          <button
            onClick={() => setStreamTab("live")}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors",
              activeTab === "live"
                ? "bg-red-600 text-white"
                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <span className="size-1.5 rounded-full bg-current animate-pulse shrink-0" />
            Live ({streams.live.length})
          </button>
        )}
        {streams.planned.length > 0 && (
          <button
            onClick={() => setStreamTab("planned")}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors",
              activeTab === "planned"
                ? "bg-blue-600 text-white"
                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            Planned ({streams.planned.length})
          </button>
        )}
        {streams.past.length > 0 && (
          <button
            onClick={() => setStreamTab("past")}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors",
              activeTab === "past"
                ? "bg-muted text-foreground"
                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            Past ({streams.past.length})
          </button>
        )}
      </div>

      {/* Horizontal scroll of stream cards */}
      <div
        ref={drag.ref}
        className="flex gap-3 overflow-x-auto pb-1 cursor-grab"
        style={{ scrollbarWidth: "none" }}
        onMouseDown={drag.onMouseDown}
        onMouseMove={drag.onMouseMove}
        onMouseUp={drag.onMouseUp}
        onMouseLeave={drag.onMouseLeave}
      >
        {activeEvents.map((e) => (
          <LiveStreamCard key={e.id} event={e} />
        ))}
      </div>
    </div>
  );
}

// ── Shorts grid thumbnail ─────────────────────────────────────────────────────

function ShortThumb({
  event,
  onClick,
}: {
  event: NostrEvent;
  onClick: () => void;
}) {
  const { url, thumbnail: imetaThumb, blurhash } = parseVideoImeta(event.tags);
  const title =
    getTag(event.tags, "title") ?? (event.content.slice(0, 60) || "Short");
  const generatedThumb = useVideoThumbnail(url ?? "", imetaThumb);
  const thumbnail = imetaThumb ?? generatedThumb;

  return (
    <button
      className="group block w-full text-left focus:outline-none"
      onClick={onClick}
      aria-label={title}
    >
      <div className="relative w-full aspect-[9/16] overflow-hidden rounded-xl bg-muted">
        {blurhash && !thumbnail && (
          <Blurhash
            hash={blurhash}
            width="100%"
            height="100%"
            resolutionX={32}
            resolutionY={32}
            punch={1}
            className="absolute inset-0"
            style={{ width: "100%", height: "100%" }}
          />
        )}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : !blurhash ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="size-8 text-muted-foreground/30" />
          </div>
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
          <div className="size-12 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="size-6 text-white fill-white ml-0.5" />
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-xs font-medium line-clamp-2 leading-snug group-hover:text-primary transition-colors w-full overflow-hidden">
        {title}
      </p>
    </button>
  );
}

// ── Shorts full-screen player (VineCard) with back-to-grid button ─────────────

function ShortsPlayer({
  events,
  startIndex,
  onClose,
}: {
  events: NostrEvent[];
  startIndex: number;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to startIndex on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({
      top: startIndex * container.clientHeight,
      behavior: "instant",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IntersectionObserver syncs activeIndex as user scrolls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const index = Array.from(container.children).indexOf(
              entry.target as Element,
            );
            if (index !== -1) setActiveIndex(index);
          }
        }
      },
      { root: container, threshold: 0.5 },
    );
    Array.from(container.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [events]);

  // Keyboard nav + Escape to go back
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!container) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(activeIndex + 1, events.length - 1);
        container.scrollTo({
          top: next * container.clientHeight,
          behavior: "smooth",
        });
        setActiveIndex(next);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(activeIndex - 1, 0);
        container.scrollTo({
          top: prev * container.clientHeight,
          behavior: "smooth",
        });
        setActiveIndex(prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, activeIndex, events.length]);

  // Same structure as VinesFeedPage: PageHeader + snap container, filling the feed column
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <PageHeader
        title="Videos"
        icon={<Film className="size-5" />}
        onBack={onClose}
        alwaysShowBack
      />

      {/* Snap-scroll VineCard column — identical sizing to VinesFeedPage */}
      <div
        ref={containerRef}
        className="vine-slide-height sidebar:h-[calc(100vh-3rem)] snap-y snap-mandatory overflow-y-scroll"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          overscrollBehavior: "none",
        }}
      >
        {events.map((event, i) => (
          <div
            key={event.id}
            className="w-full vine-slide-height sidebar:h-[calc(100vh-3rem)] snap-start snap-always flex-shrink-0"
          >
            <VineCard
              event={event}
              isActive={i === activeIndex}
              isNearActive={Math.abs(i - activeIndex) <= 1}
              onCommentClick={() => {}}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shorts grid section ───────────────────────────────────────────────────────

function ShortsSection({
  events,
  onOpen,
}: {
  events: NostrEvent[];
  onOpen: (index: number) => void;
}) {
  const drag = useDragScroll<HTMLDivElement>();
  if (events.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-4">
        Shorts
      </h2>
      <div
        ref={drag.ref}
        className="flex gap-2.5 overflow-x-auto px-4 pb-2 cursor-grab"
        style={{ scrollbarWidth: "none" }}
        onMouseDown={drag.onMouseDown}
        onMouseMove={drag.onMouseMove}
        onMouseUp={drag.onMouseUp}
        onMouseLeave={drag.onMouseLeave}
      >
        {events.map((e, i) => (
          <div key={e.id} className="shrink-0 w-32">
            <ShortThumb event={e} onClick={() => onOpen(i)} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function VideosFeedPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();

  const [feedTab, setFeedTab] = useFeedTab<FeedTab>("videos", [
    "follows",
    "global",
  ]);

  useSeoMeta({
    title: `Videos | ${config.appName}`,
    description: "Videos and live streams on Nostr",
  });

  const [shortsPlayerIndex, setShortsPlayerIndex] = useState<number | null>(
    null,
  );
  const shortsOpen = shortsPlayerIndex !== null;
  useLayoutOptions({
    showFAB: false,
    noOverscroll: true,
    hasSubHeader: !shortsOpen,
  });
  useEffect(() => {
    setShowAllVideos(false);
  }, [feedTab]);

  // ── Follows: chronological, small page ──
  const followsQuery = useFeed("follows", { kinds: [21, 22] });

  // ── Global: sort:hot, limit 8/page ──
  const globalQuery = useInfiniteHotFeed(
    [21, 22],
    feedTab === "global",
    VIDEO_PAGE_SIZE,
  );

  const activeQuery = feedTab === "follows" ? followsQuery : globalQuery;
  const { data: rawData, isPending, isLoading } = activeQuery;

  const videoEvents = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();

    const events: NostrEvent[] =
      feedTab === "follows"
        ? (rawData.pages as unknown as { items: FeedItem[] }[])
            .flatMap((p) => p.items)
            .map((item) => item.event)
        : (rawData.pages as unknown as NostrEvent[][]).flat();

    return events.filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      if (![21, 22].includes(event.kind)) return false;
      if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
      return !!parseVideoImeta(event.tags).url;
    });
  }, [rawData?.pages, muteItems, feedTab]);

  const normalVideos = useMemo(
    () => videoEvents.filter((e) => e.kind === 21),
    [videoEvents],
  );
  const shorts = useMemo(
    () => videoEvents.filter((e) => e.kind === 22),
    [videoEvents],
  );

  const [showAllVideos, setShowAllVideos] = useState(false);
  const { data: streams } = useClassifiedStreams(feedTab);
  const hasStreams =
    streams.live.length + streams.planned.length + streams.past.length > 0;
  const initialVideoCount = hasStreams ? 4 : 6;
  const visibleVideos = showAllVideos
    ? normalVideos
    : normalVideos.slice(0, initialVideoCount);

  const showSkeleton = isPending || (isLoading && !rawData);

  const handleRefresh = usePageRefresh(['feed']);

  // When the shorts player is open, render it directly as the page root —
  // same flex-1 column that VinesFeedPage uses, fully replacing the feed UI.
  if (shortsPlayerIndex !== null) {
    return (
      <ShortsPlayer
        events={shorts}
        startIndex={shortsPlayerIndex}
        onClose={() => setShortsPlayerIndex(null)}
      />
    );
  }

  return (
    <main className="">
      <PageHeader title="Videos" icon={<Film className="size-5" />}>
        <KindInfoButton
          kindDef={videosDef}
          icon={sidebarItemIcon("videos", "size-5")}
        />
      </PageHeader>

      {/* Follows / Global tabs */}
      <SubHeaderBar>
        <TabButton
          label="Follows"
          active={feedTab === "follows"}
          onClick={() => setFeedTab("follows")}
          disabled={!user}
        />
        <TabButton
          label="Global"
          active={feedTab === "global"}
          onClick={() => setFeedTab("global")}
        />
      </SubHeaderBar>
      <div style={{ height: ARC_OVERHANG_PX }} />

      {/* Live streams strip — follows tab filters by followed authors */}
      <LiveStreamsStrip tab={feedTab} />

      <PullToRefresh onRefresh={handleRefresh}>
        {showSkeleton ? (
          <div className="pt-3 pb-8 px-4">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Videos
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <VideoSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : videoEvents.length === 0 ? (
          <FeedEmptyState
            message={
              feedTab === "follows"
                ? "No videos yet. Follow some creators to see their videos here."
                : "No videos found. Check your relay connections or come back soon."
            }
            onSwitchToGlobal={
              feedTab === "follows" ? () => setFeedTab("global") : undefined
            }
          />
        ) : (
          <div className="pt-3 pb-8">
            {/* Normal videos — 2-column grid */}
            {normalVideos.length > 0 && (
              <div className="px-4 mb-8">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Videos
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-6">
                  {visibleVideos.map((e) => (
                    <VideoGridCard key={e.id} event={e} />
                  ))}
                </div>
                {!showAllVideos && normalVideos.length > initialVideoCount && (
                  <button
                    className="mt-5 w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2 border border-border rounded-lg"
                    onClick={() => setShowAllVideos(true)}
                  >
                    Show {normalVideos.length - initialVideoCount} more
                  </button>
                )}
              </div>
            )}

            {/* Shorts shelf */}
            {shorts.length > 0 && (
              <ShortsSection events={shorts} onOpen={setShortsPlayerIndex} />
            )}
          </div>
        )}
      </PullToRefresh>
    </main>
  );
}
