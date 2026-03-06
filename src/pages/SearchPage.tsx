import { useSeoMeta } from '@unhead/react';
import { useAppContext } from '@/hooks/useAppContext';
import {
  SlidersHorizontal,
  Search as SearchIcon,
  UserRoundCheck,
  User,
  Users,
  Globe,
  UserSearch,
  Clock,
  Flame,
  TrendingUp,
  RotateCcw,
  X,
  Info,
  BookmarkPlus,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  Hash,
} from 'lucide-react';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { NoteCard } from '@/components/NoteCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { getNostrIdentifierPath } from '@/lib/nostrIdentifier';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { CONTENT_KIND_ICONS } from '@/lib/sidebarItems';


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

  /** Add a resolved pubkey to the author list. */
  const addAuthor = useCallback((pubkey: string, _label: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('authorScope', 'people');
      // Avoid duplicates
      if (!next.getAll('author').includes(pubkey)) {
        next.append('author', pubkey);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  /** Remove a single author from the list by pubkey. */
  const removeAuthor = useCallback((pubkey: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const remaining = next.getAll('author').filter(a => a !== pubkey);
      next.delete('author');
      remaining.forEach(a => next.append('author', a));
      if (remaining.length === 0) next.delete('authorScope');
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

  // Build a flat list of (kind, label, icon) options from EXTRA_KINDS for the dropdown
  const kindOptions = useMemo(() => {
    type KindOption = {
      value: string;
      label: string;
      description: string;
      parentId: string;
      icon: React.ComponentType<{ className?: string }> | undefined;
    };
    const options: KindOption[] = [];
    for (const def of EXTRA_KINDS) {
      if (def.subKinds) {
        for (const sub of def.subKinds) {
          options.push({
            value: String(sub.kind),
            label: `${sub.label} (${sub.kind})`,
            description: sub.description,
            parentId: def.id,
            icon: CONTENT_KIND_ICONS[def.id],
          });
        }
      } else {
        options.push({
          value: String(def.kind),
          label: `${def.label} (${def.kind})`,
          description: def.description,
          parentId: def.id,
          icon: CONTENT_KIND_ICONS[def.id],
        });
      }
    }
    // Deduplicate by value (kind number) keeping first occurrence
    const seen = new Set<string>();
    return options.filter((o) => {
      if (seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    });
  }, []);

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

                  {/* Header */}
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

                  {/* Author scope — 3-segment toggle */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From</span>
                    <div className="flex rounded-lg border border-border overflow-hidden">
                      {([
                        ['anyone', 'Anyone', Globe],
                        ['follows', 'Follows', Users],
                        ['people', 'People', UserSearch],
                      ] as const).map(([scope, label, Icon]) => (
                        <button
                          key={scope}
                          onClick={() => setAuthorScope(scope)}
                          className={cn(
                            'flex-1 py-1.5 flex items-center justify-center gap-1 text-xs font-medium transition-colors',
                            authorScope === scope
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
                          )}
                        >
                          <Icon className="size-3.5 shrink-0" />
                          {label}
                        </button>
                      ))}
                    </div>
                    {authorScope === 'people' && (
                      <div className="space-y-1.5">
                        {/* Chips for each selected author */}
                        {authorPubkeys.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {authorPubkeys.map((pk) => (
                              <AuthorChip key={pk} pubkey={pk} onRemove={() => removeAuthor(pk)} />
                            ))}
                          </div>
                        )}
                        <AuthorFilterDropdown onCommit={addAuthor} />
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Media type + Replies row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Media</span>
                      <Select value={mediaType} onValueChange={setMediaType}>
                        <SelectTrigger className="w-full bg-secondary/50 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="images">Images</SelectItem>
                          <SelectItem value="videos">Videos</SelectItem>
                          <SelectItem value="vines">Shorts</SelectItem>
                          <SelectItem value="none">No media</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Platform</span>
                      <Select value={platform} onValueChange={setPlatform}>
                        <SelectTrigger className="w-full bg-secondary/50 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nostr">Nostr</SelectItem>
                          <SelectItem value="activitypub">Mastodon</SelectItem>
                          <SelectItem value="atproto">Bluesky</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Language + Kind row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Language</span>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="w-full bg-secondary/50 h-8 text-xs">
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
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kind</span>
                      <KindPicker value={kindFilter} options={kindOptions} onChange={setKindFilter} />
                    </div>
                  </div>

                  {kindFilter === 'custom' && (
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 1, 30023"
                      value={customKindText}
                      onChange={(e) => setCustomKindText(e.target.value)}
                      className="bg-secondary/50 border-border focus-visible:ring-1 rounded-lg text-xs h-8"
                    />
                  )}
                  {hasKindMediaConflict && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                      <Info className="size-3.5 shrink-0 mt-0.5" />
                      Media + Kind filters may conflict. Kind takes precedence.
                    </p>
                  )}

                  {/* Sort + Replies row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sort</span>
                      <div className="flex rounded-lg border border-border overflow-hidden">
                        {([
                          ['recent', 'Recent', Clock],
                          ['hot', 'Hot', Flame],
                          ['trending', 'Trending', TrendingUp],
                        ] as const).map(([s, label, Icon]) => (
                          <button
                            key={s}
                            onClick={() => setSort(s)}
                            className={cn(
                              'flex-1 py-1.5 flex items-center justify-center gap-1 text-xs font-medium transition-colors',
                              sort === s
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
                            )}
                          >
                            <Icon className="size-3.5 shrink-0" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Include replies toggle */}
                  <div className="flex items-center justify-between pt-0.5">
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
function AuthorChip({ pubkey, onRemove }: { pubkey: string; onRemove: () => void }) {
  const hexPubkey = useMemo(() => {
    if (/^[0-9a-f]{64}$/i.test(pubkey)) return pubkey;
    try { const d = nip19.decode(pubkey); return d.type === 'npub' ? d.data : pubkey; } catch { return pubkey; }
  }, [pubkey]);
  const author = useAuthor(hexPubkey);
  const name = author.data?.metadata?.display_name || author.data?.metadata?.name || pubkey.slice(0, 10) + '…';
  const picture = author.data?.metadata?.picture;
  return (
    <span className="inline-flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded-full bg-secondary border border-border text-xs max-w-[160px]">
      {picture ? (
        <img src={picture} alt="" className="size-4 rounded-full shrink-0 object-cover" />
      ) : (
        <User className="size-3 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{name}</span>
      <button onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" aria-label="Remove">
        <X className="size-3" />
      </button>
    </span>
  );
}

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

type KindOption = {
  value: string;
  label: string;
  description: string;
  parentId: string;
  icon: React.ComponentType<{ className?: string }> | undefined;
};

/** Reusable scroll-caret logic — same pattern as SidebarMoreMenu. */
function useScrollCarets() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  const refCallback = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    roRef.current = ro;
    update();
  }, [update]);

  const stopScroll = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startScroll = useCallback((direction: 'up' | 'down') => {
    stopScroll();
    intervalRef.current = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return stopScroll();
      el.scrollBy({ top: direction === 'up' ? -8 : 8 });
      update();
      const atLimit = direction === 'up' ? el.scrollTop <= 0 : el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (atLimit) stopScroll();
    }, 16);
  }, [update, stopScroll]);

  useEffect(() => stopScroll, [stopScroll]);

  return { refCallback, canScrollUp, canScrollDown, onScroll: update, startScroll, stopScroll };
}

function KindScrollCaret({ direction, onMouseEnter, onMouseLeave }: { direction: 'up' | 'down'; onMouseEnter: () => void; onMouseLeave: () => void }) {
  return (
    <button
      className="flex cursor-default items-center justify-center py-0.5 w-full shrink-0 text-muted-foreground hover:text-foreground"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {direction === 'up' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
    </button>
  );
}

function KindPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: KindOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { refCallback, canScrollUp, canScrollDown, onScroll, startScroll, stopScroll } = useScrollCarets();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        o.value.includes(q),
    );
  }, [options, search]);

  const selected = value === 'all' || value === 'custom' ? null : options.find((o) => o.value === value);
  const SelectedIcon = selected?.icon;

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'w-full h-8 px-2.5 rounded-md border bg-secondary/50 text-xs flex items-center gap-1.5 text-left transition-colors',
            'hover:bg-secondary border-border',
            open && 'border-ring ring-1 ring-ring',
          )}
        >
          {SelectedIcon
            ? <SelectedIcon className="size-3.5 shrink-0 text-muted-foreground" />
            : <Hash className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="flex-1 truncate">
            {value === 'all' ? 'All' : value === 'custom' ? 'Custom…' : (selected?.label ?? value)}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-56 p-0 flex flex-col overflow-hidden"
        style={{ maxHeight: 'min(280px, var(--radix-popover-content-available-height, 280px))' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border shrink-0">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="Search kinds…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Scroll carets + list */}
        {canScrollUp && (
          <KindScrollCaret direction="up" onMouseEnter={() => startScroll('up')} onMouseLeave={stopScroll} />
        )}
        <div
          ref={refCallback}
          className="overflow-y-auto flex-1 min-h-0"
          onScroll={onScroll}
        >
          {!search && (
            <KindPickerItem icon={null} label="All kinds" active={value === 'all'} onClick={() => handleSelect('all')} />
          )}
          {filtered.map((opt) => (
            <KindPickerItem
              key={opt.value}
              icon={opt.icon ?? null}
              label={opt.label}
              active={value === opt.value}
              onClick={() => handleSelect(opt.value)}
            />
          ))}
          {(!search || 'custom'.includes(search.toLowerCase())) && (
            <KindPickerItem icon={Hash} label="Custom kind…" active={value === 'custom'} onClick={() => handleSelect('custom')} />
          )}
          {filtered.length === 0 && search && (
            <p className="text-xs text-muted-foreground text-center py-4">No kinds match</p>
          )}
        </div>
        {canScrollDown && (
          <KindScrollCaret direction="down" onMouseEnter={() => startScroll('down')} onMouseLeave={stopScroll} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function KindPickerItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }> | null;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors text-left',
        active
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-secondary/60 text-foreground',
      )}
    >
      {Icon
        ? <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        : <span className="size-3.5 shrink-0" />}
      <span className="truncate">{label}</span>
      {active && <Check className="size-3 shrink-0 ml-auto text-primary" />}
    </button>
  );
}

function AuthorFilterDropdown({ onCommit }: { onCommit: (pubkey: string, label: string) => void }) {
  const handleSelect = useCallback((profile: SearchProfile) => {
    const npub = nip19.npubEncode(profile.pubkey);
    const label = profile.metadata.display_name || profile.metadata.name || npub.slice(0, 16) + '…';
    onCommit(npub, label);
  }, [onCommit]);

  return (
    <ProfileSearchDropdown
      placeholder="Search by name or npub…"
      onSelect={handleSelect}
      hideCountry
      inputClassName="rounded-lg bg-secondary/50 border border-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 text-sm h-9"
      className="w-full"
    />
  );
}
