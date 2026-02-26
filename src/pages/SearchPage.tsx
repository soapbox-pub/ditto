import { useSeoMeta } from '@unhead/react';
import { ChevronUp, ChevronDown, Search as SearchIcon, Flame, TrendingUp, Swords, Image, Video, Film, Languages, UserRoundCheck, Loader2 } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { NoteCard } from '@/components/NoteCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useSearchProfiles } from '@/hooks/useSearchProfiles';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useTrendingTags, useInfiniteSortedPosts, type SortMode } from '@/hooks/useTrending';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { getNostrIdentifierPath } from '@/lib/nostrIdentifier';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import { nip19 } from 'nostr-tools';


type TabType = 'posts' | 'trends' | 'accounts';

const VALID_TABS: TabType[] = ['posts', 'trends', 'accounts'];

function parseTab(value: string | null): TabType {
  return VALID_TABS.includes(value as TabType) ? (value as TabType) : 'posts';
}

export function SearchPage() {
  useSeoMeta({
    title: 'Search | Ditto',
    description: 'Search Nostr',
  });

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive tab directly from URL — single source of truth (no separate state)
  const activeTab = parseTab(searchParams.get('tab'));

  // Local input state for the search field (avoids trimming while typing)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [trendSort, setTrendSort] = useState<SortMode>('hot');

  // Update tab in URL without a feedback loop
  const setActiveTab = useCallback((tab: TabType) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'posts') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Sync search query state → URL (only when the trimmed value actually differs)
  useEffect(() => {
    const currentQ = searchParams.get('q') ?? '';
    const trimmed = searchQuery.trim();
    if (trimmed !== currentQ) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (trimmed) {
          next.set('q', trimmed);
        } else {
          next.delete('q');
        }
        return next;
      }, { replace: true });
    }
  }, [searchQuery, searchParams, setSearchParams]);

  // Sync URL → search query state (e.g., sidebar search or browser navigation)
  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    if (q !== searchQuery.trim()) {
      setSearchQuery(q);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the search query is a Nostr identifier, redirect immediately
  useEffect(() => {
    const path = getNostrIdentifierPath(searchQuery);
    if (path) {
      navigate(path, { replace: true });
    }
  }, [searchQuery, navigate]);

  // Search filters
  const [includeReplies, setIncludeReplies] = useState(true);
  const [mediaType, setMediaType] = useState<'all' | 'images' | 'videos' | 'vines' | 'none'>('all');
  const [language, setLanguage] = useState('global');
  const [showNostr, setShowNostr] = useState(true);
  const [showMastodon, setShowMastodon] = useState(false);

  // Hooks
  const { posts: allPosts, isLoading: postsLoading } = useStreamPosts(searchQuery, { includeReplies, mediaType, language });
  const { data: profiles, isLoading: profilesLoading, followedPubkeys } = useSearchProfiles(activeTab === 'accounts' ? searchQuery : '');
  const isTrendsTab = activeTab === 'trends';
  const { data: trends, isLoading: trendsLoading } = useTrendingTags(isTrendsTab);
  const {
    data: sortedData,
    isPending: sortedPending,
    isLoading: sortedLoading,
    fetchNextPage: fetchNextSorted,
    hasNextPage: hasNextSorted,
    isFetchingNextPage: isFetchingNextSorted,
  } = useInfiniteSortedPosts(trendSort, isTrendsTab);
  const { muteItems } = useMuteList();

  // Flatten, deduplicate, and filter muted posts from paginated sorted results
  const sortedPosts = useMemo(() => {
    const seen = new Set<string>();
    return sortedData?.pages.flat().filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
      return true;
    }) ?? [];
  }, [sortedData?.pages, muteItems]);

  // Intersection observer for infinite scroll on sorted posts
  const { ref: sortedScrollRef, inView: sortedInView } = useInView({
    threshold: 0,
    rootMargin: '400px',
  });

  useEffect(() => {
    if (sortedInView && hasNextSorted && !isFetchingNextSorted) {
      fetchNextSorted();
    }
  }, [sortedInView, hasNextSorted, isFetchingNextSorted, fetchNextSorted]);

  // Filter by platform (Nostr/Mastodon) client-side
  const posts = useMemo(() => {
    return allPosts.filter(event => {
      const hasActivityPubProxy = event.tags.some(
        tag => tag[0] === 'proxy' && tag.length > 2 && tag[2] === 'activitypub'
      );
      
      const isMastodon = hasActivityPubProxy;
      const isNostr = !hasActivityPubProxy;
      
      if (isMastodon && !showMastodon) return false;
      if (isNostr && !showNostr) return false;
      
      return true;
    });
  }, [allPosts, showNostr, showMastodon]);

  return (
      <main className="min-h-screen">
        {/* Tabs — sticky at top */}
        <div className={cn(STICKY_HEADER_CLASS, 'bg-background/80 backdrop-blur-md z-10 border-b border-border')}>
          <div className="flex">
            <TabButton label="Posts" active={activeTab === 'posts'} onClick={() => setActiveTab('posts')} />
            <TabButton label="Trends" active={activeTab === 'trends'} onClick={() => setActiveTab('trends')} />
            <TabButton label="Accounts" active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')} />
          </div>
        </div>

        {/* ─── Posts Tab ─── */}
        {activeTab === 'posts' && (
          <>
            {/* Search input */}
            <div className="px-4 pt-5 pb-2">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 bg-secondary/50 border-border focus-visible:ring-1 rounded-lg"
                />
                <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Search filters — collapsible */}
            <div className="border-b border-border">
              {/* Header row */}
              <button
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="w-full px-4 py-3 flex items-center justify-between"
              >
                <h2 className="font-bold text-lg">Search filters</h2>
                <span className="size-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
                  {filtersOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </span>
              </button>

              {/* Filter controls */}
              {filtersOpen && (
                <div className="px-4 pb-4 space-y-4">
                  {/* Including replies */}
                  <div className="flex items-center gap-3">
                    <span className="font-medium">Including replies</span>
                    <Switch
                      checked={includeReplies}
                      onCheckedChange={setIncludeReplies}
                    />
                  </div>

                  {/* Media type — horizontal wrap */}
                  <div className="space-y-2">
                    <span className="font-medium">With ONLY the media type:</span>
                    <RadioGroup
                      value={mediaType}
                      onValueChange={(v) => setMediaType(v as typeof mediaType)}
                      className="flex flex-wrap gap-x-4 gap-y-2"
                    >
                      {[
                        { value: 'all', label: 'All media' },
                        { value: 'images', label: 'Images', icon: Image },
                        { value: 'videos', label: 'Videos', icon: Video },
                        { value: 'vines', label: 'Vines', icon: Film },
                        { value: 'none', label: 'No media' },
                      ].map(({ value, label, icon: Icon }) => (
                        <div key={value} className="flex items-center space-x-2">
                          <RadioGroupItem value={value} id={`media-${value}`} />
                          <Label htmlFor={`media-${value}`} className="font-normal cursor-pointer flex items-center gap-1.5">
                            {Icon && <Icon className="size-4 text-muted-foreground" />}
                            {label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Language — inline */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Languages className="size-4 text-muted-foreground" />
                      <span className="font-medium whitespace-nowrap">In the language:</span>
                    </div>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="w-40 bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">Global</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="ja">Japanese</SelectItem>
                        <SelectItem value="zh">Chinese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Platform filter */}
                  <div className="space-y-2">
                    <span className="font-medium">Show posts from:</span>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="platform-nostr"
                          checked={showNostr}
                          onCheckedChange={(checked) => setShowNostr(!!checked)}
                        />
                        <Label htmlFor="platform-nostr" className="font-normal cursor-pointer">
                          Nostr
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="platform-mastodon"
                          checked={showMastodon}
                          onCheckedChange={(checked) => setShowMastodon(!!checked)}
                        />
                        <Label htmlFor="platform-mastodon" className="font-normal cursor-pointer">
                          Mastodon
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Post results — stream */}
            {postsLoading && posts.length === 0 ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <PostSkeleton key={i} />
                ))}
              </div>
            ) : posts.length > 0 ? (
              <div>
                {posts.map((event) => (
                  <NoteCard key={event.id} event={event} />
                ))}
              </div>
            ) : searchQuery.trim() ? (
              <EmptyState message="No posts found matching your search." />
            ) : (
              <EmptyState message="Enter a search query to find posts." />
            )}
          </>
        )}

        {/* ─── Trends Tab ─── */}
        {activeTab === 'trends' && (
          <div>
            {/* Trending Hashtags */}
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-lg font-bold text-accent">Trending Hashtags</h3>
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
                  <TrendItem key={index} trend={{ tag: trend.tag, count: trend.uses }} />
                ))}
              </div>
            ) : (
              <EmptyState message="No trending hashtags right now." />
            )}

            {/* Sort sub-tabs */}
            <div className="flex border-b border-border">
              <SortTabButton icon={<Flame className="size-4" />} label="Hot" active={trendSort === 'hot'} onClick={() => setTrendSort('hot')} activeColor="text-primary" underlineColor="bg-primary" />
              <SortTabButton icon={<TrendingUp className="size-4" />} label="Rising" active={trendSort === 'rising'} onClick={() => setTrendSort('rising')} activeColor="text-accent" underlineColor="bg-accent" />
              <SortTabButton icon={<Swords className="size-4" />} label="Controversial" active={trendSort === 'controversial'} onClick={() => setTrendSort('controversial')} activeColor="text-destructive" underlineColor="bg-destructive" />
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
          </div>
        )}

        {/* ─── Accounts Tab ─── */}
        {activeTab === 'accounts' && (
          <>
            {/* Search input for accounts */}
            <div className="px-4 pt-5 pb-2">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 bg-secondary/50 border-border focus-visible:ring-1 rounded-lg"
                />
                <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div>
              {searchQuery.trim() ? (
                profilesLoading ? (
                  <div className="divide-y divide-border">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <AccountSkeleton key={i} />
                    ))}
                  </div>
                ) : profiles && profiles.length > 0 ? (
                  <div className="divide-y divide-border">
                    {profiles.map((profile) => (
                      <AccountItem key={profile.pubkey} profile={profile} isFollowed={followedPubkeys.has(profile.pubkey)} />
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No accounts found matching your search." />
                )
              ) : (
                <EmptyState message="Search for people by name or NIP-05 address." />
              )}
            </div>
          </>
        )}
      </main>
  );
}

/* ── Shared sub-components ── */

function SortTabButton({ icon, label, active, onClick, activeColor = 'text-primary', underlineColor = 'bg-primary' }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  activeColor?: string;
  underlineColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 py-2.5 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? activeColor : 'text-muted-foreground',
      )}
    >
      {icon}
      {label}
      {active && (
        <div className={cn('absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full', underlineColor)} />
      )}
    </button>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 py-3.5 sidebar:py-5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
      )}
    </button>
  );
}

function TrendItem({ trend }: { trend: { tag: string; count: number } }) {
  return (
    <Link
      to={`/t/${encodeURIComponent(trend.tag)}`}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary transition-colors text-sm font-semibold text-primary"
    >
      #{trend.tag}
      {trend.count > 0 && (
        <span className="text-xs text-muted-foreground font-normal">{trend.count}</span>
      )}
    </Link>
  );
}

function AccountItem({ profile, isFollowed }: { profile: { pubkey: string; metadata: Record<string, unknown>; event?: { tags: string[][] } }; isFollowed: boolean }) {
  const npub = useMemo(() => nip19.npubEncode(profile.pubkey), [profile.pubkey]);
  const metadata = profile.metadata as { name?: string; nip05?: string; picture?: string; about?: string; bot?: boolean };
  const displayName = metadata?.name || genUserName(profile.pubkey);
  const tags = profile.event?.tags ?? [];

  return (
    <Link
      to={`/${npub}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <div className="relative shrink-0">
        <Avatar className="size-11">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {isFollowed && (
          <span
            className="absolute -bottom-0.5 -right-0.5 size-[18px] rounded-full bg-primary flex items-center justify-center ring-2 ring-background"
            title="Following"
          >
            <UserRoundCheck className="size-2.5 text-primary-foreground" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-[15px] truncate">
            <EmojifiedText tags={tags}>{displayName}</EmojifiedText>
          </p>
          {metadata?.bot && <span className="text-xs" title="Bot account">🤖</span>}
        </div>
        {metadata?.nip05 && (
          <VerifiedNip05Text nip05={metadata.nip05} pubkey={profile.pubkey} className="text-sm text-muted-foreground truncate block" />
        )}
        {metadata?.about && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            <EmojifiedText tags={tags}>{metadata.about}</EmojifiedText>
          </p>
        )}
      </div>
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
      {/* Header: avatar + stacked name/handle — matches NoteCard layout */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      {/* Content */}
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      {/* Actions */}
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

function AccountSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-11 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  );
}
