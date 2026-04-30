import { Link } from 'react-router-dom';
import { LinkFooter } from '@/components/LinkFooter';
import { useOpenPost } from '@/hooks/useOpenPost';
import { X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Skeleton } from '@/components/ui/skeleton';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useTrendingTags, useLatestAccounts, useSortedPosts, useTagSparklines } from '@/hooks/useTrending';
import { useAuthor } from '@/hooks/useAuthor';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { formatNumber } from '@/lib/formatNumber';
import { timeAgo } from '@/lib/timeAgo';
import { NSchema as n } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

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

// Re-export TrendSparkline from its dedicated module for backwards compatibility.
import { TrendSparkline } from '@/components/TrendSparkline';
export { TrendSparkline };

export function RightSidebar() {
  const isXl = useIsXl();

  const { data: trendingTagsResult, isLoading: tagsLoading } = useTrendingTags(isXl);
  const { data: rawHotPosts, isLoading: hotLoading } = useSortedPosts('hot', 5, isXl);
  const { data: latestAccounts, isLoading: accountsLoading } = useLatestAccounts(isXl);
  const { muteItems } = useMuteList();
  const [dismissedAccounts, setDismissedAccounts] = useLocalStorage<string[]>('dismissed-new-accounts', []);

  const dismissAccount = useCallback((pubkey: string) => {
    setDismissedAccounts((prev) => [...prev, pubkey]);
  }, [setDismissedAccounts]);

  const filteredAccounts = useMemo(() => {
    if (!latestAccounts || dismissedAccounts.length === 0) return latestAccounts;
    return latestAccounts.filter((e) => !dismissedAccounts.includes(e.pubkey));
  }, [latestAccounts, dismissedAccounts]);

  const trendingTags = trendingTagsResult?.tags;
  const labelCreatedAt = trendingTagsResult?.labelCreatedAt ?? 0;

  const hotPosts = useMemo(() => {
    if (!rawHotPosts || muteItems.length === 0) return rawHotPosts;
    return rawHotPosts.filter((e) => !isEventMuted(e, muteItems));
  }, [rawHotPosts, muteItems]);

  // Fetch real sparkline data for the visible trending tags
  const visibleTags = useMemo(() => (trendingTags ?? []).slice(0, 5).map((t) => t.tag), [trendingTags]);
  const { data: sparklineData, isLoading: sparklinesLoading } = useTagSparklines(visibleTags, labelCreatedAt, isXl && visibleTags.length > 0);

  return (
    <aside className="w-[300px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen overflow-y-auto pt-2 pb-3 px-3">
      {/* Trending Tags */}
      <section className="mb-6 bg-background/85 rounded-xl p-3 -mx-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>Trends</h2>
          <Link to="/trends" className="text-sm text-primary hover:underline">View all</Link>
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
                  {item.accounts > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="text-primary font-semibold">{formatNumber(item.accounts)}</span> people talking
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
      <section className="mb-6 bg-background/85 rounded-xl p-3 -mx-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>Hot Posts</h2>
          <Link to="/trends" className="text-sm text-primary hover:underline">More</Link>
        </div>

        {hotLoading ? (
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
      <section className="mb-6 bg-background/85 rounded-xl p-3 -mx-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>New Accounts</h2>
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
            {filteredAccounts?.map((event) => (
              <LatestAccountCard key={event.id} event={event} onDismiss={dismissAccount} />
            ))}
          </div>
        )}
      </section>

      <LinkFooter />
    </aside>
  );
}

/** Compact hot post card for the sidebar. */
function HotPostCard({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || metadata?.display_name || genUserName(event.pubkey);
  const encodedId = useMemo(() => nip19.neventEncode({ id: event.id, author: event.pubkey }), [event]);
  const { onClick: openPost, onAuxClick } = useOpenPost(`/${encodedId}`);

  // Truncate content for sidebar display
  const snippet = useMemo(() => {
    // Strip URLs for a cleaner snippet
    const clean = event.content.replace(/https?:\/\/\S+/g, '').trim();
    if (clean.length > 100) return clean.slice(0, 100) + '…';
    return clean || '(media)';
  }, [event.content]);

  return (
    <button
      onClick={openPost}
      onAuxClick={onAuxClick}
      className="block w-full text-left hover:bg-secondary/40 -mx-2 px-2 py-2 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Avatar shape={avatarShape} className="size-4">
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

function LatestAccountCard({ event, onDismiss }: { event: NostrEvent; onDismiss: (pubkey: string) => void }) {
  let metadata: { name?: string; display_name?: string; nip05?: string; picture?: string } = {};
  try {
    metadata = n.json().pipe(n.metadata()).parse(event.content);
  } catch {
    // Invalid metadata
  }

  const displayName = metadata.name || metadata.display_name || genUserName(event.pubkey);
  const latestAvatarShape = getAvatarShape(metadata);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  return (
    <div className="flex items-center gap-3 group hover:bg-secondary/40 -mx-2 px-2 py-2 rounded-lg transition-colors">
      <Link to={`/${npub}`} className="shrink-0">
        <Avatar shape={latestAvatarShape} className="size-10">
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
          <VerifiedNip05Text nip05={metadata.nip05} pubkey={event.pubkey} className="text-xs text-muted-foreground truncate block" />
        )}
      </div>

      <button
        onClick={() => onDismiss(event.pubkey)}
        className="p-1 rounded-full text-muted-foreground hover:bg-secondary transition-colors opacity-0 group-hover:opacity-100"
        aria-label={`Dismiss ${displayName}`}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
