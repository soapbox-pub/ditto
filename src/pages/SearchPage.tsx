import { useSeoMeta } from '@unhead/react';
import { useAppContext } from '@/hooks/useAppContext';
import {
  SlidersHorizontal,
  Search as SearchIcon,
  UserRoundCheck,
  User,
  RotateCcw,
  BookmarkPlus,
  Check,
  Loader2,
} from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { NoteCard } from '@/components/NoteCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmojifiedText } from '@/components/CustomEmoji';
import { SavedFeedFiltersEditor, buildKindOptions } from '@/components/SavedFeedFiltersEditor';
import { useSearchProfiles } from '@/hooks/useSearchProfiles';
import { useAuthor } from '@/hooks/useAuthor';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';

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

const VALID_AUTHOR_SCOPES = ['anyone', 'follows', 'people'] as const;
type AuthorScope = typeof VALID_AUTHOR_SCOPES[number];

const VALID_SORTS = ['recent', 'hot', 'trending'] as const;
type SortPref = typeof VALID_SORTS[number];

const DEFAULT_FILTERS = {
  includeReplies: true,
  mediaType: 'all' as const,
  language: 'global',
  platform: 'nostr' as const,
  kindFilter: 'all',
  customKindText: '',
  authorScope: 'anyone' as AuthorScope,
  sort: 'recent' as SortPref,
};

/** Parse a boolean from a URL param, returning defaultVal if absent/invalid. */
function parseBoolParam(value: string | null, defaultVal: boolean): boolean {
  if (value === null) return defaultVal;
  return value !== 'false';
}

export function SearchPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Search | ${config.appName}`,
    description: 'Search Nostr',
  });

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive tab directly from URL — single source of truth
  const activeTab = parseTab(searchParams.get('tab'));

  // Local input state for the search field (avoids trimming while typing)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Filter state — all derived from URL params ──────────────────────────
  const includeReplies = parseBoolParam(searchParams.get('replies'), DEFAULT_FILTERS.includeReplies);
  const VALID_MEDIA_TYPES = ['all', 'images', 'videos', 'vines', 'none'] as const;
  type MediaType = typeof VALID_MEDIA_TYPES[number];
  const rawMedia = searchParams.get('media') ?? DEFAULT_FILTERS.mediaType;
  const mediaType: MediaType = (VALID_MEDIA_TYPES as readonly string[]).includes(rawMedia) ? (rawMedia as MediaType) : DEFAULT_FILTERS.mediaType;
  const language = searchParams.get('lang') ?? DEFAULT_FILTERS.language;
  const VALID_PLATFORMS = ['nostr', 'activitypub', 'atproto'] as const;
  type PlatformType = typeof VALID_PLATFORMS[number];
  const rawPlatform = searchParams.get('platform') ?? DEFAULT_FILTERS.platform;
  const platform: PlatformType = (VALID_PLATFORMS as readonly string[]).includes(rawPlatform) ? (rawPlatform as PlatformType) : DEFAULT_FILTERS.platform;
  const kindFilter = searchParams.get('kind') ?? DEFAULT_FILTERS.kindFilter;
  const customKindText = searchParams.get('customKind') ?? DEFAULT_FILTERS.customKindText;
  const rawAuthorScope = searchParams.get('authorScope') ?? DEFAULT_FILTERS.authorScope;
  const authorScope: AuthorScope = (VALID_AUTHOR_SCOPES as readonly string[]).includes(rawAuthorScope)
    ? (rawAuthorScope as AuthorScope)
    : DEFAULT_FILTERS.authorScope;
  // Multiple authors stored as repeated ?author= params
  const authorPubkeys = useMemo(() => searchParams.getAll('author'), [searchParams]);
  const rawSort = searchParams.get('sort') ?? DEFAULT_FILTERS.sort;
  const sort: SortPref = (VALID_SORTS as readonly string[]).includes(rawSort)
    ? (rawSort as SortPref)
    : DEFAULT_FILTERS.sort;
  // ────────────────────────────────────────────────────────────────────────

  // Helper to update a single URL param
  const setParam = useCallback((key: string, value: string, defaultValue: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === defaultValue) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setIncludeReplies = useCallback((v: boolean) => setParam('replies', String(v), String(DEFAULT_FILTERS.includeReplies)), [setParam]);
  const setMediaType = useCallback((v: string) => setParam('media', v, DEFAULT_FILTERS.mediaType), [setParam]);
  const setLanguage = useCallback((v: string) => setParam('lang', v, DEFAULT_FILTERS.language), [setParam]);
  const setPlatform = useCallback((v: string) => setParam('platform', v, DEFAULT_FILTERS.platform), [setParam]);
  const setSort = useCallback((v: string) => setParam('sort', v, DEFAULT_FILTERS.sort), [setParam]);
  const setKindFilter = useCallback((v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === DEFAULT_FILTERS.kindFilter) {
        next.delete('kind');
      } else {
        next.set('kind', v);
      }
      if (v !== 'custom') next.delete('customKind');
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const setCustomKindText = useCallback((v: string) => setParam('customKind', v, DEFAULT_FILTERS.customKindText), [setParam]);

  const setAuthorScope = useCallback((scope: AuthorScope) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (scope === DEFAULT_FILTERS.authorScope) {
        next.delete('authorScope');
      } else {
        next.set('authorScope', scope);
      }
      // Clear specific authors when switching away from 'people'
      if (scope !== 'people') {
        next.delete('author');
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);



  // Update tab in URL
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

  // Sync search query state → URL
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

  const protocols = useMemo(() => [platform], [platform]);

  const kindOptions = useMemo(() => buildKindOptions(), []);

  // Resolve kindsOverride from the current kind filter state
  const kindsOverride = useMemo<number[] | undefined>(() => {
    if (kindFilter === 'all') return undefined;
    if (kindFilter === 'custom') {
      const parsed = customKindText.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      return parsed.length > 0 ? parsed : undefined;
    }
    const n = Number(kindFilter);
    return Number.isInteger(n) && n > 0 ? [n] : undefined;
  }, [kindFilter, customKindText]);

  // Detect kind + media type conflict: a specific kind is selected AND a media type is set
  const hasKindMediaConflict = kindsOverride !== undefined && mediaType !== 'all';

  // Determine if any filter differs from the default
  const hasActiveFilters = !includeReplies || mediaType !== DEFAULT_FILTERS.mediaType ||
    language !== DEFAULT_FILTERS.language || platform !== DEFAULT_FILTERS.platform ||
    kindFilter !== DEFAULT_FILTERS.kindFilter || authorScope !== DEFAULT_FILTERS.authorScope ||
    sort !== DEFAULT_FILTERS.sort || authorPubkeys.length > 0;

  const resetFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('replies');
      next.delete('media');
      next.delete('lang');
      next.delete('platform');
      next.delete('kind');
      next.delete('customKind');
      next.delete('authorScope');
      next.delete('author');
      next.delete('sort');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Build the NIP-50 search string that will be sent to the relay (for display)
  const nip50SearchString = useMemo(() => {
    const bridged = protocols.filter(p => p !== 'nostr');
    const parts: string[] = bridged.length > 0
      ? bridged.map(p => `protocol:${p}`)
      : ['protocol:nostr'];
    if (searchQuery.trim()) parts.push(searchQuery.trim());
    if (language !== 'global') parts.push(`language:${language}`);
    const isDedicatedKindQuery = !kindsOverride && (mediaType === 'vines' || mediaType === 'images' || mediaType === 'videos');
    if (!isDedicatedKindQuery && !hasKindMediaConflict) {
      if (mediaType === 'images') { parts.push('media:true'); parts.push('video:false'); }
      else if (mediaType === 'videos') parts.push('video:true');
      else if (mediaType === 'none') parts.push('media:false');
    }
    if (sort === 'hot') parts.push('sort:hot');
    else if (sort === 'trending') parts.push('sort:trending');
    return parts.join(' ');
  }, [searchQuery, language, mediaType, protocols, kindsOverride, hasKindMediaConflict, sort]);

  // Active filter labels for the summary / empty state hints
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (!includeReplies) labels.push('No replies');
    if (mediaType !== 'all') labels.push({ images: 'Images', videos: 'Videos', vines: 'Shorts & Vines', none: 'No media' }[mediaType] ?? mediaType);
    if (language !== 'global') labels.push(language.toUpperCase());
    if (platform !== 'nostr') labels.push({ activitypub: 'Mastodon', atproto: 'Bluesky' }[platform] ?? platform);
    if (sort !== 'recent') labels.push(sort === 'hot' ? 'Hot' : 'Trending');
    if (kindFilter !== 'all' && kindFilter !== 'custom') {
      const opt = kindOptions.find(o => o.value === kindFilter);
      if (opt) labels.push(opt.label);
    } else if (kindFilter === 'custom' && customKindText) {
      labels.push(`Kind: ${customKindText}`);
    }
    if (authorScope === 'follows') labels.push('My follows');
    if (authorScope === 'people' && authorPubkeys.length > 0) labels.push(`${authorPubkeys.length} author${authorPubkeys.length > 1 ? 's' : ''}`);
    return labels;
  }, [includeReplies, mediaType, language, platform, sort, kindFilter, customKindText, authorScope, authorPubkeys, kindOptions]);

  // Hooks
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const followPubkeys = useMemo(() => followData?.pubkeys ?? [], [followData?.pubkeys]);
  const { savedFeeds, addSavedFeed, isPending: isSavingFeed } = useSavedFeeds();
  const [savePopoverOpen, setSavePopoverOpen] = useState(false);
  const [saveFeedLabel, setSaveFeedLabel] = useState('');
  const [savedJustNow, setSavedJustNow] = useState(false);

  // 'people' scope with explicit authors = user-specific; not eligible for profile tab
  const isAuthorSpecific = authorScope === 'people' && authorPubkeys.length > 0;

  // Build the filters object for matching / saving
  const currentFilters = useMemo<import('@/contexts/AppContext').SavedFeedFilters>(() => ({
    query: searchQuery.trim(), mediaType, language, platform, kindFilter, customKindText,
    authorScope, authorPubkeys, sort,
  }), [searchQuery, mediaType, language, platform, kindFilter, customKindText, authorScope, authorPubkeys, sort]);

  const alreadySaved = savedFeeds.some(
    (f) =>
      f.filters.query === currentFilters.query &&
      f.filters.mediaType === currentFilters.mediaType &&
      f.filters.language === currentFilters.language &&
      f.filters.platform === currentFilters.platform &&
      f.filters.kindFilter === currentFilters.kindFilter &&
      f.filters.authorScope === currentFilters.authorScope &&
      f.filters.sort === currentFilters.sort &&
      JSON.stringify([...f.filters.authorPubkeys].sort()) === JSON.stringify([...currentFilters.authorPubkeys].sort()),
  );

  const handleSave = async (destination: 'feed' | 'profile') => {
    if (!saveFeedLabel.trim() || isSavingFeed) return;
    // Profile tabs auto-lock scope to 'people' with the current user's pubkey
    const filtersToSave = destination === 'profile' && user
      ? { ...currentFilters, authorScope: 'people' as const, authorPubkeys: authorPubkeys.length > 0 ? authorPubkeys : [user.pubkey] }
      : currentFilters;
    await addSavedFeed(saveFeedLabel, filtersToSave, destination);
    setSavePopoverOpen(false);
    setSaveFeedLabel('');
    setSavedJustNow(true);
    setTimeout(() => setSavedJustNow(false), 2000);
  };

  // Resolve author pubkeys for the stream
  const streamAuthorPubkeys = authorScope === 'follows'
    ? followPubkeys
    : authorScope === 'people' && authorPubkeys.length > 0
      ? authorPubkeys
      : undefined;

  const { posts, isLoading: postsLoading } = useStreamPosts(searchQuery, {
    includeReplies,
    mediaType,
    language,
    protocols,
    kindsOverride,
    authorPubkeys: streamAuthorPubkeys,
    sort,
  });
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

                {/* Add to feed button */}
                {user && searchQuery.trim() && (
                  <Popover open={savePopoverOpen} onOpenChange={(o) => { setSavePopoverOpen(o); if (o && !saveFeedLabel) setSaveFeedLabel(searchQuery.trim()); }}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          'shrink-0 h-10 w-10 rounded-lg border flex items-center justify-center transition-colors',
                          alreadySaved || savedJustNow
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground',
                        )}
                        style={{ outline: 'none' }}
                        aria-label="Add to feed"
                      >
                        {savedJustNow ? <Check className="size-4" /> : <BookmarkPlus className="size-4" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 p-3 space-y-3">
                      <p className="font-semibold text-sm">Save as tab</p>

                      {alreadySaved ? (
                        <p className="text-sm text-muted-foreground">Already saved.</p>
                      ) : (
                        <>
                          <Input
                            placeholder="Tab name…"
                            value={saveFeedLabel}
                            onChange={(e) => setSaveFeedLabel(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSave('feed'); }}
                            className="bg-secondary/50 border-border focus-visible:ring-1 text-sm"
                            autoFocus
                          />
                          <div className="space-y-1">
                            <SaveDestinationRow
                              icon={<BookmarkPlus className="size-4 text-muted-foreground" />}
                              label="Home feed"
                              description="Tab on your home page"
                              onClick={() => handleSave('feed')}
                              disabled={!saveFeedLabel.trim() || isSavingFeed}
                              loading={isSavingFeed}
                            />
                            {!isAuthorSpecific && (
                              <SaveDestinationRow
                                icon={<User className="size-4 text-muted-foreground" />}
                                label="Profile tab"
                                description="Your posts matching this search"
                                onClick={() => handleSave('profile')}
                                disabled={!saveFeedLabel.trim() || isSavingFeed}
                                loading={isSavingFeed}
                              />
                            )}
                          </div>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                )}

                {/* Filter popover */}
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      'shrink-0 h-10 w-10 rounded-lg border bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors',
                      filtersOpen
                        ? 'border-2 border-primary bg-secondary text-primary'
                        : hasActiveFilters
                          ? 'border-primary text-primary'
                          : 'border-border',
                    )}
                    style={{ outline: 'none' }}
                    aria-label="Search filters"
                  >
                    <SlidersHorizontal className="size-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Filters</span>
                    {hasActiveFilters && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        onClick={resetFilters}
                      >
                        <RotateCcw className="size-3" />
                        Reset
                      </button>
                    )}
                  </div>

                  <SavedFeedFiltersEditor
                    showQuery={false}
                    value={{ query: searchQuery.trim(), mediaType, language, platform, kindFilter, customKindText, authorScope, authorPubkeys, sort }}
                    onChange={(patch) => {
                      if ('authorScope' in patch && patch.authorScope !== undefined) setAuthorScope(patch.authorScope);
                      if ('authorPubkeys' in patch && patch.authorPubkeys !== undefined) {
                        // Sync array to URL repeated params
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          next.delete('author');
                          (patch.authorPubkeys ?? []).forEach((pk) => next.append('author', pk));
                          if ((patch.authorPubkeys ?? []).length === 0) next.delete('authorScope');
                          return next;
                        }, { replace: true });
                      }
                      if ('sort' in patch && patch.sort !== undefined) setSort(patch.sort);
                      if ('mediaType' in patch && patch.mediaType !== undefined) setMediaType(patch.mediaType);
                      if ('platform' in patch && patch.platform !== undefined) setPlatform(patch.platform);
                      if ('language' in patch && patch.language !== undefined) setLanguage(patch.language);
                      if ('kindFilter' in patch && patch.kindFilter !== undefined) setKindFilter(patch.kindFilter);
                      if ('customKindText' in patch && patch.customKindText !== undefined) setCustomKindText(patch.customKindText);
                    }}
                    kindOptions={kindOptions}
                  />

                  {/* Include replies toggle — lives outside SavedFeedFilters schema */}
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Include replies</span>
                    <Switch checked={includeReplies} onCheckedChange={setIncludeReplies} className="scale-90" />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Active filter summary chips */}
            {activeFilterLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {activeFilterLabels.map((label) => (
                  <Badge key={label} variant="secondary" className="text-xs font-normal">
                    {label}
                  </Badge>
                ))}
                <button
                  onClick={resetFilters}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}

            {/* NIP-50 search query debug block */}
            {searchQuery.trim() && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="mt-2 px-3 py-2 rounded-md bg-secondary/40 border border-border cursor-default">
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        <span className="text-muted-foreground/60 mr-1">search:</span>
                        {nip50SearchString}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs font-mono break-all">
                    {nip50SearchString}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
            <EmptyState
              message="No posts found matching your search."
              activeFilters={activeFilterLabels}
              onResetFilters={hasActiveFilters ? resetFilters : undefined}
            />
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

function EmptyState({
  message,
  activeFilters,
  onResetFilters,
}: {
  message: string;
  activeFilters?: string[];
  onResetFilters?: () => void;
}) {
  return (
    <div className="py-16 px-8 text-center">
      <p className="text-muted-foreground">{message}</p>
      {activeFilters && activeFilters.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground/70 mb-2">Active filters:</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {activeFilters.map((label) => (
              <Badge key={label} variant="secondary" className="text-xs font-normal">
                {label}
              </Badge>
            ))}
          </div>
          {onResetFilters && (
            <button
              onClick={onResetFilters}
              className="mt-3 text-xs text-primary hover:underline underline-offset-2 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
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

/**
 * Author filter input that uses the profile search dropdown.
 * Commits to the parent only when:
 *  - A profile is selected from the dropdown (fires onCommit immediately with npub + display name)
 *  - The user manually types a full npub1… / hex pubkey / NIP-05 and presses Enter or blurs
 */
/** Small removable chip showing a single selected author. */

function SaveDestinationRow({
  icon, label, description, onClick, disabled, loading,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/60 disabled:opacity-40 disabled:pointer-events-none transition-colors text-left"
    >
      <span className="shrink-0">{loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}


