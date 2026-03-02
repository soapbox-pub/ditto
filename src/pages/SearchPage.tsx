import { useSeoMeta } from '@unhead/react';
import { useAppContext } from '@/hooks/useAppContext';
import { SlidersHorizontal, Search as SearchIcon, Image, Video, Film, Languages, UserRoundCheck } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { NoteCard } from '@/components/NoteCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useSearchProfiles } from '@/hooks/useSearchProfiles';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useFollowList } from '@/hooks/useFollowActions';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { getNostrIdentifierPath } from '@/lib/nostrIdentifier';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import { nip19 } from 'nostr-tools';


type TabType = 'posts' | 'accounts';

const VALID_TABS: TabType[] = ['posts', 'accounts'];

function parseTab(value: string | null): TabType {
  return VALID_TABS.includes(value as TabType) ? (value as TabType) : 'posts';
}

export function SearchPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Search | ${config.appName}`,
    description: 'Search Nostr',
  });

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive tab directly from URL — single source of truth (no separate state)
  const activeTab = parseTab(searchParams.get('tab'));

  // Local input state for the search field (avoids trimming while typing)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  const [platform, setPlatform] = useState<'nostr' | 'activitypub' | 'atproto'>('nostr');

  const protocols = [platform];

  // Hooks
  const { posts, isLoading: postsLoading } = useStreamPosts(searchQuery, { includeReplies, mediaType, language, protocols });
  const { data: profiles, isLoading: profilesLoading, followedPubkeys } = useSearchProfiles(activeTab === 'accounts' ? searchQuery : '');

  return (
      <main className="">
        {/* Tabs — sticky at top */}
        <div className={cn(STICKY_HEADER_CLASS, 'bg-background/80 backdrop-blur-md z-10 border-b border-border')}>
          <div className="flex">
            <TabButton label="Posts" active={activeTab === 'posts'} onClick={() => setActiveTab('posts')} />
            <TabButton label="Accounts" active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')} />
          </div>
        </div>

        {/* ─── Posts Tab ─── */}
        {activeTab === 'posts' && (
          <>
            {/* Search input + filter icon */}
            <div className="px-4 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10 bg-secondary/50 border-border focus-visible:ring-1 rounded-lg"
                  />
                  <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                </div>

                {/* Filter popover */}
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                   <PopoverTrigger asChild>
                     <button
                       className={cn(
                          'shrink-0 h-10 w-10 rounded-lg border bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors',
                          filtersOpen
                            ? 'border-2 border-primary bg-secondary text-primary'
                            : (includeReplies !== true || mediaType !== 'all' || language !== 'global' || platform !== 'nostr')
                              ? 'border-primary text-primary'
                              : 'border-border',
                       )}
                       style={{ outline: 'none' }}
                       aria-label="Search filters"
                     >
                      <SlidersHorizontal className="size-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-4 space-y-4">
                    {/* Including replies */}
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">Include replies</span>
                      <Switch
                        checked={includeReplies}
                        onCheckedChange={setIncludeReplies}
                      />
                    </div>

                    <Separator />

                    {/* Media type */}
                    <div className="space-y-2">
                      <span className="font-medium text-sm">Media type</span>
                      <RadioGroup
                        value={mediaType}
                        onValueChange={(v) => setMediaType(v as typeof mediaType)}
                        className="space-y-1.5"
                      >
                        {[
                          { value: 'all', label: 'All media' },
                          { value: 'images', label: 'Images', icon: Image },
                          { value: 'videos', label: 'Videos', icon: Video },
                           { value: 'vines', label: 'Shorts & Vines', icon: Film },
                          { value: 'none', label: 'No media' },
                        ].map(({ value, label, icon: Icon }) => (
                          <div key={value} className="flex items-center space-x-2">
                            <RadioGroupItem value={value} id={`media-${value}`} />
                            <Label htmlFor={`media-${value}`} className="font-normal cursor-pointer flex items-center gap-1.5 text-sm">
                              {Icon && <Icon className="size-3.5 text-muted-foreground" />}
                              {label}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>

                    <Separator />

                    {/* Language */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Languages className="size-3.5 text-muted-foreground" />
                        <span className="font-medium text-sm">Language</span>
                      </div>
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

                    <Separator />

                    {/* Platform */}
                    <div className="space-y-2">
                      <span className="font-medium text-sm">Show posts from</span>
                      <RadioGroup
                        value={platform}
                        onValueChange={(v) => setPlatform(v as typeof platform)}
                        className="space-y-1.5"
                      >
                        {[
                          { value: 'nostr', label: 'Nostr' },
                          { value: 'activitypub', label: 'Mastodon' },
                          { value: 'atproto', label: 'Bluesky' },
                        ].map(({ value, label }) => (
                          <div key={value} className="flex items-center space-x-2">
                            <RadioGroupItem value={value} id={`platform-${value}`} />
                            <Label htmlFor={`platform-${value}`} className="font-normal cursor-pointer text-sm">
                              {label}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
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
                <FollowsList />
              )}
            </div>
          </>
        )}
      </main>
  );
}

/* ── Shared sub-components ── */

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

function FollowsList() {
  const { data: followData } = useFollowList();
  const pubkeys = followData?.pubkeys ?? [];

  if (pubkeys.length === 0) {
    return <EmptyState message="Search for people by name or NIP-05 address." />;
  }

  return (
    <div className="divide-y divide-border">
      {pubkeys.map((pubkey) => (
        <FollowItem key={pubkey} pubkey={pubkey} />
      ))}
    </div>
  );
}

function FollowItem({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const npub = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const displayName = metadata?.name || genUserName(pubkey);
  const tags = author.data?.event?.tags ?? [];

  if (author.isLoading) {
    return <AccountSkeleton />;
  }

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
        <span
          className="absolute -bottom-0.5 -right-0.5 size-[18px] rounded-full bg-primary flex items-center justify-center ring-2 ring-background"
          title="Following"
        >
          <UserRoundCheck className="size-2.5 text-primary-foreground" strokeWidth={3} />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-[15px] truncate">
            <EmojifiedText tags={tags}>{displayName}</EmojifiedText>
          </p>
          {metadata?.bot && <span className="text-xs" title="Bot account">🤖</span>}
        </div>
        {metadata?.nip05 && (
          <VerifiedNip05Text nip05={metadata.nip05} pubkey={pubkey} className="text-sm text-muted-foreground truncate block" />
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
