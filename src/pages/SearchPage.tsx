import { useSeoMeta } from '@unhead/react';
import { ChevronUp, ChevronDown, Search as SearchIcon, Flame, TrendingUp, Swords } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { NoteCard } from '@/components/NoteCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useSearchProfiles } from '@/hooks/useSearchProfiles';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { TrendSparkline } from '@/components/RightSidebar';
import { useTrendingTags, useSortedPosts } from '@/hooks/useTrending';
import { genUserName } from '@/lib/genUserName';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

type TabType = 'posts' | 'trends' | 'accounts';

export function SearchPage() {
  useSeoMeta({
    title: 'Search | Mew',
    description: 'Search Nostr',
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const initialTab = searchParams.get('tab') as TabType | null;

  const [activeTab, setActiveTab] = useState<TabType>(initialTab === 'trends' || initialTab === 'accounts' ? initialTab : 'posts');
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Sync search query and tab to URL params
  useEffect(() => {
    const params: Record<string, string> = {};
    if (searchQuery.trim()) params.q = searchQuery.trim();
    if (activeTab !== 'posts') params.tab = activeTab;
    setSearchParams(params, { replace: true });
  }, [searchQuery, activeTab, setSearchParams]);

  // Update search query when URL params change externally (e.g., from sidebar search)
  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    if (q && q !== searchQuery) {
      setSearchQuery(q);
    }
    const tab = searchParams.get('tab') as TabType | null;
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Search filters
  const [includeReplies, setIncludeReplies] = useState(true);
  const [mediaType, setMediaType] = useState<'all' | 'images' | 'videos' | 'vines' | 'none'>('all');
  const [language, setLanguage] = useState('global');

  // Hooks
  const { posts, isLoading: postsLoading } = useStreamPosts(searchQuery, { includeReplies, mediaType });
  const { data: profiles, isLoading: profilesLoading } = useSearchProfiles(activeTab === 'accounts' ? searchQuery : '');
  const isTrendsTab = activeTab === 'trends';
  const { data: trends, isLoading: trendsLoading } = useTrendingTags(isTrendsTab);
  const { data: hotPosts, isLoading: hotLoading } = useSortedPosts('hot', 5, isTrendsTab);
  const { data: risingPosts, isLoading: risingLoading } = useSortedPosts('rising', 5, isTrendsTab);
  const { data: controversialPosts, isLoading: controversialLoading } = useSortedPosts('controversial', 5, isTrendsTab);

  return (
    <MainLayout>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        {/* Tabs — sticky at top */}
        <div className={cn(STICKY_HEADER_CLASS, 'bg-background/95 backdrop-blur-md z-20 border-b border-border')}>
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
            <div className="px-4 pt-4 pb-2">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 bg-secondary/50 border-border focus-visible:ring-1 rounded-lg"
                  autoFocus
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
                    <span className="font-bold text-sm">Including replies</span>
                    <Switch
                      checked={includeReplies}
                      onCheckedChange={setIncludeReplies}
                    />
                  </div>

                  {/* Media type — horizontal wrap */}
                  <div className="space-y-2">
                    <span className="font-bold text-sm">With ONLY the media type:</span>
                    <RadioGroup
                      value={mediaType}
                      onValueChange={(v) => setMediaType(v as typeof mediaType)}
                      className="flex flex-wrap gap-x-4 gap-y-2"
                    >
                      {[
                        { value: 'all', label: 'All media' },
                        { value: 'images', label: 'Images' },
                        { value: 'videos', label: 'Videos' },
                        { value: 'vines', label: 'Vines' },
                        { value: 'none', label: 'No media' },
                      ].map(({ value, label }) => (
                        <div key={value} className="flex items-center space-x-1.5">
                          <RadioGroupItem value={value} id={`media-${value}`} />
                          <Label htmlFor={`media-${value}`} className="font-normal cursor-pointer text-sm text-muted-foreground">{label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Language — inline */}
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm whitespace-nowrap">In the language:</span>
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
              <h3 className="text-lg font-bold">Trending Hashtags</h3>
            </div>
            {trendsLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <TrendSkeleton key={i} />
                ))}
              </div>
            ) : trends && trends.length > 0 ? (
              <div className="divide-y divide-border">
                {trends.slice(0, 5).map((trend, index) => (
                  <TrendItem key={index} trend={trend} />
                ))}
              </div>
            ) : (
              <EmptyState message="No trending hashtags right now." />
            )}

            {/* Hot Posts */}
            <SortedPostsSection
              title="Hot"
              icon={<Flame className="size-5 text-primary" />}
              posts={hotPosts}
              isLoading={hotLoading}
            />

            {/* Rising Posts */}
            <SortedPostsSection
              title="Rising"
              icon={<TrendingUp className="size-5 text-primary" />}
              posts={risingPosts}
              isLoading={risingLoading}
            />

            {/* Controversial Posts */}
            <SortedPostsSection
              title="Controversial"
              icon={<Swords className="size-5 text-primary" />}
              posts={controversialPosts}
              isLoading={controversialLoading}
            />
          </div>
        )}

        {/* ─── Accounts Tab ─── */}
        {activeTab === 'accounts' && (
          <>
            {/* Search input for accounts */}
            <div className="px-4 pt-4 pb-2">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 bg-secondary/50 border-border focus-visible:ring-1 rounded-lg"
                  autoFocus
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
                      <AccountItem key={profile.pubkey} profile={profile} />
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
    </MainLayout>
  );
}

/* ── Shared sub-components ── */

function SortedPostsSection({ title, icon, posts, isLoading }: {
  title: string;
  icon: React.ReactNode;
  posts: NostrEvent[] | undefined;
  isLoading: boolean;
}) {
  return (
    <>
      <div className="px-4 pt-6 pb-2 flex items-center gap-2">
        {icon}
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
      {isLoading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <PostSkeleton key={i} />
          ))}
        </div>
      ) : posts && posts.length > 0 ? (
        <div>
          {posts.slice(0, 5).map((event) => (
            <NoteCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <EmptyState message={`No ${title.toLowerCase()} posts right now.`} />
      )}
    </>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
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
      className="flex items-center justify-between px-4 py-2 hover:bg-secondary/30 transition-colors"
    >
      <div>
        <div className="font-bold text-[15px]">#{trend.tag}</div>
        {trend.count > 0 && (
          <div className="text-xs text-muted-foreground">{trend.count} posts</div>
        )}
      </div>
      <TrendSparkline />
    </Link>
  );
}

function AccountItem({ profile }: { profile: { pubkey: string; metadata: Record<string, unknown> } }) {
  const npub = useMemo(() => nip19.npubEncode(profile.pubkey), [profile.pubkey]);
  const metadata = profile.metadata as { name?: string; nip05?: string; picture?: string; about?: string; bot?: boolean };
  const displayName = metadata?.name || genUserName(profile.pubkey);

  return (
    <Link
      to={`/${npub}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <Avatar className="size-11 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-[15px] truncate">{displayName}</p>
          {metadata?.bot && <span className="text-xs" title="Bot account">🤖</span>}
        </div>
        {metadata?.nip05 && (
          <p className="text-sm text-muted-foreground truncate">@{metadata.nip05}</p>
        )}
        {metadata?.about && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{metadata.about}</p>
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
