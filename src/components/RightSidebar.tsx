import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrendingTags, useLatestAccounts } from '@/hooks/useTrending';
import { genUserName } from '@/lib/genUserName';
import { NSchema as n } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useMemo, useState, useEffect } from 'react';
import { useIsFetching } from '@tanstack/react-query';

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

/** Small sparkline SVG for trending tags. */
function TrendSparkline() {
  // Generate a simple random-ish upward sparkline
  const points = useMemo(() => {
    const pts: string[] = [];
    let y = 20 + Math.random() * 10;
    for (let x = 0; x <= 50; x += 5) {
      y = Math.max(5, Math.min(30, y + (Math.random() - 0.4) * 8));
      pts.push(`${x},${y}`);
    }
    return pts.join(' ');
  }, []);

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

export function RightSidebar() {
  const isXl = useIsXl();

  // Only start sidebar queries once the feed has finished its initial fetch.
  // Track: feed must start fetching first, then finish, before we enable sidebar queries.
  const feedFetching = useIsFetching({ queryKey: ['feed'] });
  const [feedStarted, setFeedStarted] = useState(false);
  const [feedHasLoaded, setFeedHasLoaded] = useState(false);

  useEffect(() => {
    if (!feedStarted && feedFetching > 0) {
      setFeedStarted(true);
    }
    if (feedStarted && !feedHasLoaded && feedFetching === 0) {
      setFeedHasLoaded(true);
    }
  }, [feedFetching, feedStarted, feedHasLoaded]);

  const sidebarEnabled = isXl && feedHasLoaded;

  const { data: trendingTags, isLoading: tagsLoading } = useTrendingTags(sidebarEnabled);
  const { data: latestAccounts, isLoading: accountsLoading } = useLatestAccounts(sidebarEnabled);

  return (
    <aside className="w-[300px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen overflow-y-auto pt-6 pb-3 px-5">
      {/* Trending Tags */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Trends</h2>
          <Link to="/search" className="text-sm text-primary hover:underline">View all</Link>
        </div>

        {tagsLoading ? (
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
        ) : (
          <div className="space-y-3">
            {trendingTags?.map((item) => (
              <Link
                key={item.tag}
                to={`/t/${item.tag}`}
                className="flex items-center justify-between group hover:bg-secondary/40 -mx-2 px-2 py-1.5 rounded-lg transition-colors"
              >
                <div>
                  <div className="font-bold text-sm">#{item.tag}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="text-primary font-semibold">{item.count}</span> people talking
                  </div>
                </div>
                <TrendSparkline />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Latest Accounts */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Latest Accounts</h2>
          <Link to="/search" className="text-sm text-primary hover:underline">View all</Link>
        </div>

        {accountsLoading ? (
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

function LatestAccountCard({ event }: { event: { pubkey: string; content: string } }) {
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
          {displayName}
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
