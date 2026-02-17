import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Search as SearchIcon } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
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
import type { NostrEvent } from '@nostrify/nostrify';

type TabType = 'posts' | 'trends' | 'accounts';

export function SearchPage() {
  useSeoMeta({
    title: 'Search | Mew',
    description: 'Search Nostr',
  });

  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [searchQuery, setSearchQuery] = useState('');

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
        {/* Header with back button and search */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-md z-20 border-b border-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors shrink-0">
              <ArrowLeft className="size-5" />
            </Link>
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1"
                autoFocus
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            <TabButton
              label="Posts"
              active={activeTab === 'posts'}
              onClick={() => setActiveTab('posts')}
            />
            <TabButton
              label="Trends"
              active={activeTab === 'trends'}
              onClick={() => setActiveTab('trends')}
            />
            <TabButton
              label="Accounts"
              active={activeTab === 'accounts'}
              onClick={() => setActiveTab('accounts')}
            />
          </div>
        </div>

        <div className="flex">
          {/* Left Sidebar - Search Filters (Posts tab only) */}
          {activeTab === 'posts' && (
            <aside className="hidden md:block w-64 border-r border-border shrink-0">
              <div className="sticky top-[145px] p-4 space-y-6">
                <h2 className="font-bold text-lg">Search filters</h2>

                {/* Include replies toggle */}
                <div className="space-y-3">
                  <Label htmlFor="include-replies" className="text-base font-normal">
                    Including replies
                  </Label>
                  <div className="flex justify-end">
                    <Switch
                      id="include-replies"
                      checked={includeReplies}
                      onCheckedChange={setIncludeReplies}
                    />
                  </div>
                </div>

                {/* Media type filter */}
                <div className="space-y-3">
                  <Label className="text-base font-normal">With ONLY the media type:</Label>
                  <RadioGroup value={mediaType} onValueChange={(v) => setMediaType(v as typeof mediaType)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="media-all" />
                      <Label htmlFor="media-all" className="font-normal cursor-pointer">All media</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="images" id="media-images" />
                      <Label htmlFor="media-images" className="font-normal cursor-pointer">Images</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="videos" id="media-videos" />
                      <Label htmlFor="media-videos" className="font-normal cursor-pointer">Regular videos</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="vines" id="media-vines" />
                      <Label htmlFor="media-vines" className="font-normal cursor-pointer">Short videos (Vines)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="none" id="media-none" />
                      <Label htmlFor="media-none" className="font-normal cursor-pointer">No media</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Language filter */}
                <div className="space-y-3">
                  <Label className="text-base font-normal">In the language:</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full bg-secondary/50">
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
            </aside>
          )}

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            {/* Posts Tab */}
            {activeTab === 'posts' && (
              <>
                {searchQuery.trim() ? (
                  postsLoading ? (
                    <div className="divide-y divide-border">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <PostSkeleton key={i} />
                      ))}
                    </div>
                  ) : posts && posts.length > 0 ? (
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

            {/* Trends Tab */}
            {activeTab === 'trends' && (
              <div className="divide-y divide-border">
                {trendsLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TrendSkeleton key={i} />
                  ))
                ) : trends && trends.length > 0 ? (
                  trends.map((trend, index) => (
                    <TrendItem key={index} trend={trend} />
                  ))
                ) : (
                  <EmptyState message="No trends available at the moment." />
                )}
              </div>
            )}

            {/* Accounts Tab */}
            {activeTab === 'accounts' && (
              <div className="divide-y divide-border">
                {searchQuery.trim() ? (
                  profilesLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <AccountSkeleton key={i} />
                    ))
                  ) : profiles && profiles.length > 0 ? (
                    profiles.map((profile) => (
                      <AccountItem key={profile.pubkey} profile={profile} />
                    ))
                  ) : (
                    <EmptyState message="No accounts found matching your search." />
                  )
                ) : (
                  <EmptyState message="Search for people by name or NIP-05 address." />
                )}
              </div>
            )}
          </div>
        </div>
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
      className="block px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">Trending</p>
          <p className="font-bold text-[15px] mt-0.5">#{trend.tag}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{trend.count} posts</p>
        </div>
      </div>
    </Link>
  );
}

function AccountItem({ profile }: { profile: { pubkey: string; metadata: any } }) {
  const npub = useMemo(() => nip19.npubEncode(profile.pubkey), [profile.pubkey]);
  const displayName = profile.metadata?.name || genUserName(profile.pubkey);
  const nip05 = profile.metadata?.nip05;

  return (
    <Link
      to={`/${npub}`}
      className="block px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <div className="flex items-center gap-3">
        <Avatar className="size-12 shrink-0">
          <AvatarImage src={profile.metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-bold truncate">{displayName}</p>
            {profile.metadata?.bot && (
              <span className="text-xs text-primary" title="Bot account">🤖</span>
            )}
          </div>
          {nip05 && (
            <p className="text-sm text-muted-foreground truncate">@{nip05}</p>
          )}
          {profile.metadata?.about && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {profile.metadata.about}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="col-span-full">
      <Card className="border-dashed m-4">
        <CardContent className="py-12 px-8 text-center">
          <div className="max-w-sm mx-auto space-y-6">
            <p className="text-muted-foreground">{message}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-8" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendSkeleton() {
  return (
    <div className="px-4 py-3">
      <Skeleton className="h-3 w-16 mb-2" />
      <Skeleton className="h-5 w-32 mb-1" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
    </div>
  );
}
