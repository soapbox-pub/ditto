import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, ChevronDown, ChevronUp, Search as SearchIcon } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { NoteCard } from '@/components/NoteCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useSearchProfiles } from '@/hooks/useSearchProfiles';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useTrendingTags } from '@/hooks/useTrending';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import { nip19 } from 'nostr-tools';

type TabType = 'posts' | 'trends' | 'accounts';

export function SearchPage() {
  useSeoMeta({
    title: 'Search | Mew',
    description: 'Search Nostr',
  });

  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Search filters
  const [includeReplies, setIncludeReplies] = useState(true);
  const [mediaType, setMediaType] = useState<'all' | 'images' | 'videos' | 'vines' | 'none'>('all');
  const [language, setLanguage] = useState('global');

  // Search hooks
  const { posts, isLoading: postsLoading } = useStreamPosts(searchQuery, {
    includeReplies,
    mediaType,
  });
  const { data: profiles, isLoading: profilesLoading } = useSearchProfiles(activeTab === 'accounts' ? searchQuery : '');
  const { data: trends, isLoading: trendsLoading } = useTrendingTags();

  return (
    <MainLayout hideMobileTopBar>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l lg:border-r border-border min-h-screen">
        {/* Sticky header */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-md z-20">
          {/* Search bar */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors shrink-0">
              <ArrowLeft className="size-5" />
            </Link>
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1 rounded-full"
                autoFocus
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            <TabButton label="Posts" active={activeTab === 'posts'} onClick={() => setActiveTab('posts')} />
            <TabButton label="Trends" active={activeTab === 'trends'} onClick={() => setActiveTab('trends')} />
            <TabButton label="Accounts" active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')} />
          </div>
        </div>

        {/* === Posts Tab === */}
        {activeTab === 'posts' && (
          <>
            {/* Collapsible search filters */}
            <div className="border-b border-border">
              <button
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors"
              >
                <span className="font-bold text-lg">Search filters</span>
                {filtersOpen
                  ? <ChevronUp className="size-5 text-muted-foreground" />
                  : <ChevronDown className="size-5 text-muted-foreground" />
                }
              </button>

              <div
                className={cn(
                  'overflow-hidden transition-all duration-200 ease-in-out',
                  filtersOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0',
                )}
              >
                <div className="px-4 pb-4 space-y-5">
                  {/* Include replies */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="include-replies" className="text-[15px] font-normal cursor-pointer">
                      Including replies
                    </Label>
                    <Switch
                      id="include-replies"
                      checked={includeReplies}
                      onCheckedChange={setIncludeReplies}
                    />
                  </div>

                  {/* Media type */}
                  <div className="space-y-2.5">
                    <Label className="text-[15px] font-normal">With ONLY the media type:</Label>
                    <RadioGroup value={mediaType} onValueChange={(v) => setMediaType(v as typeof mediaType)} className="space-y-1.5">
                      {[
                        { value: 'all', label: 'All media' },
                        { value: 'images', label: 'Images' },
                        { value: 'videos', label: 'Regular videos' },
                        { value: 'vines', label: 'Short videos (Vines)' },
                        { value: 'none', label: 'No media' },
                      ].map(({ value, label }) => (
                        <div key={value} className="flex items-center space-x-2">
                          <RadioGroupItem value={value} id={`media-${value}`} />
                          <Label htmlFor={`media-${value}`} className="font-normal cursor-pointer text-sm">{label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Language */}
                  <div className="space-y-2.5">
                    <Label className="text-[15px] font-normal">In the language:</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="w-full bg-secondary/50 rounded-lg">
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
              </div>
            </div>

            {/* Post results */}
            {searchQuery.trim() ? (
              postsLoading && posts.length === 0 ? (
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
              ) : (
                <EmptyState message="No posts found matching your search." />
              )
            ) : (
              <EmptyState message="Enter a search query to find posts." />
            )}
          </>
        )}

        {/* === Trends Tab === */}
        {activeTab === 'trends' && (
          <div>
            {trendsLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 8 }).map((_, i) => (
                  <TrendSkeleton key={i} />
                ))}
              </div>
            ) : trends && trends.length > 0 ? (
              <div className="divide-y divide-border">
                {trends.map((trend, index) => (
                  <TrendItem key={index} trend={trend} />
                ))}
              </div>
            ) : (
              <EmptyState message="No trends available at the moment." />
            )}
          </div>
        )}

        {/* === Accounts Tab === */}
        {activeTab === 'accounts' && (
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
        )}
      </main>
    </MainLayout>
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
      className="block px-4 py-3.5 hover:bg-secondary/30 transition-colors"
    >
      <p className="text-xs text-muted-foreground">Trending</p>
      <p className="font-bold text-[15px] mt-0.5">#{trend.tag}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{trend.count.toLocaleString()} posts</p>
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
      <div className="flex gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="flex gap-12 mt-2">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
          </div>
        </div>
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
