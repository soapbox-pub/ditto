import { Link, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useTrendingTags, useLatestAccounts, useSortedPosts, useTagSparklines } from '@/hooks/useTrending';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { NSchema as n } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useMemo, useState, useEffect } from 'react';

const XL_BREAKPOINT = 1280;

/** Returns true when the viewport is at least the xl breakpoint (1280px). */
function useIsXl(): boolean {
  const [isXl, setIsXl] = useState(window.innerWidth >= XL_BREAKPOINT);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${XL_BREAKPOINT}px)`);
    const onChange = () => setIsXl(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isXl;
}

/** Small sparkline SVG driven by real data points. */
export function TrendSparkline({ data }: { data: number[] }) {
  const points = useMemo(() => {
    if (data.length === 0) return '';

    const max = Math.max(...data, 1); // avoid division by zero
    const w = 50;
    const h = 30;
    const padding = 3;
    const usableH = h - padding * 2;
    const step = w / Math.max(data.length - 1, 1);

    return data
      .map((v, i) => {
        const x = i * step;
        // Invert y so higher values go up
        const y = padding + usableH - (v / max) * usableH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data]);

  if (!points) return null;

  return (
    <svg width="50" height="35" viewBox="0 0 50 35" className="text-primary/60">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Track whether the sidebar has already loaded data at least once. */
let hasLoadedOnce = false;

export function RightSidebar() {
  const isXl = useIsXl();

  // Delay sidebar data loading only on the very first mount to prioritize
  // initial feed performance. On subsequent mounts (page navigations) skip
  // the delay since TanStack Query will serve cached data instantly.
  const [sidebarEnabled, setSidebarEnabled] = useState(hasLoadedOnce);
  
  useEffect(() => {
    if (hasLoadedOnce) return;
    const timer = setTimeout(() => {
      hasLoadedOnce = true;
      setSidebarEnabled(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const { data: trendingTags, isLoading: tagsLoading } = useTrendingTags(isXl && sidebarEnabled);
  const { data: hotPosts, isLoading: hotLoading } = useSortedPosts('hot', 5, isXl && sidebarEnabled);
  const { data: latestAccounts, isLoading: accountsLoading } = useLatestAccounts(isXl && sidebarEnabled);

  // Fetch real sparkline data for the visible trending tags
  const visibleTags = useMemo(() => (trendingTags ?? []).slice(0, 5).map((t) => t.tag), [trendingTags]);
  const { data: sparklineData, isLoading: sparklinesLoading } = useTagSparklines(visibleTags, isXl && visibleTags.length > 0);

  return (
    <aside className="w-[300px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen overflow-y-auto pt-5 pb-3 px-5">
      {/* Trending Tags */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Trends</h2>
          <Link to="/search?tab=trends" className="text-sm text-primary hover:underline">View all</Link>
        </div>

        {!sidebarEnabled || tagsLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-8 w-12" />
              </div>
            ))}
          </div>
        ) : trendingTags && trendingTags.length > 0 ? (
          <div className="space-y-3">
            {trendingTags.slice(0, 5).map((item) => (
              <Link
                key={item.tag}
                to={`/t/${item.tag}`}
                className="flex items-center justify-between group hover:bg-secondary/40 -mx-2 px-2 py-1.5 rounded-lg transition-colors"
              >
                <div>
                  <div className="font-bold text-sm">#{item.tag}</div>
                  {item.count > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="text-primary font-semibold">{item.count}</span> posts
                    </div>
                  )}
                </div>
                {sparklinesLoading ? (
                  <Skeleton className="h-[35px] w-[50px] rounded" />
                ) : (
                  <TrendSparkline data={sparklineData?.get(item.tag) ?? []} />
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No trends available.</p>
        )}
      </section>

      {/* Hot Posts */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Hot Posts</h2>
          <Link to="/search?tab=trends" className="text-sm text-primary hover:underline">More</Link>
        </div>

        {!sidebarEnabled || hotLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            ))}
          </div>
        ) : hotPosts && hotPosts.length > 0 ? (
          <div className="space-y-1">
            {hotPosts.slice(0, 5).map((event) => (
              <HotPostCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hot posts right now.</p>
        )}
      </section>

      {/* Latest Accounts */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">New Accounts</h2>
        </div>

        {!sidebarEnabled || accountsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {latestAccounts?.map((event) => (
              <LatestAccountCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="mt-auto pt-4 pb-4 text-right">
        <p className="text-xs text-muted-foreground">
          Vibed with{' '}
          <a href="https://shakespeare.diy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            Shakespeare
          </a>
        </p>
      </footer>
    </aside>
  );
}

/** Compact hot post card for the sidebar. */
function HotPostCard({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const encodedId = useMemo(() => nip19.neventEncode({ id: event.id, author: event.pubkey }), [event]);

  // Truncate content for sidebar display
  const snippet = useMemo(() => {
    // Strip URLs for a cleaner snippet
    const clean = event.content.replace(/https?:\/\/\S+/g, '').trim();
    if (clean.length > 100) return clean.slice(0, 100) + '…';
    return clean || '(media)';
  }, [event.content]);

  return (
    <button
      onClick={() => navigate(`/${encodedId}`)}
      className="block w-full text-left hover:bg-secondary/40 -mx-2 px-2 py-2 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Avatar className="size-4">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs font-semibold truncate">
          {author.data?.event ? (
            <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
          ) : displayName}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">· {timeAgo(event.created_at)}</span>
      </div>
      <p className="text-[13px] text-muted-foreground leading-snug line-clamp-2">{snippet}</p>
    </button>
  );
}

function LatestAccountCard({ event }: { event: NostrEvent }) {
  let metadata: { name?: string; nip05?: string; picture?: string } = {};
  try {
    metadata = n.json().pipe(n.metadata()).parse(event.content);
  } catch {
    // Invalid metadata
  }

  const displayName = metadata.name || genUserName(event.pubkey);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  return (
    <div className="flex items-center gap-3 group hover:bg-secondary/40 -mx-2 px-2 py-2 rounded-lg transition-colors">
      <Link to={`/${npub}`} className="shrink-0">
        <Avatar className="size-10">
          <AvatarImage src={metadata.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <Link to={`/${npub}`} className="font-bold text-sm hover:underline truncate block">
          <EmojifiedText tags={event.tags}>{displayName}</EmojifiedText>
        </Link>
        {metadata.nip05 && (
          <span className="text-xs text-muted-foreground truncate block">
            @{metadata.nip05}
          </span>
        )}
      </div>

      <button className="p-1 rounded-full text-muted-foreground hover:bg-secondary transition-colors opacity-0 group-hover:opacity-100">
        <X className="size-4" />
      </button>
    </div>
  );
}
