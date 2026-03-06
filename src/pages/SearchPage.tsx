import { useSeoMeta } from '@unhead/react';
import { useAppContext } from '@/hooks/useAppContext';
import {
  SlidersHorizontal,
  Search as SearchIcon,
  Image,
  Video,
  Film,
  Languages,
  UserRoundCheck,
  Hash,
  User,
  RotateCcw,
  X,
  Info,
} from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { NoteCard } from '@/components/NoteCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { CONTENT_KIND_ICONS } from '@/lib/sidebarItems';


type TabType = 'posts' | 'accounts';

const VALID_TABS: TabType[] = ['posts', 'accounts'];

function parseTab(value: string | null): TabType {
  return VALID_TABS.includes(value as TabType) ? (value as TabType) : 'posts';
}

const DEFAULT_FILTERS = {
  includeReplies: true,
  mediaType: 'all' as const,
  language: 'global',
  platform: 'nostr' as const,
  kindFilter: 'all',
  customKindText: '',
  authorQuery: '',
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
  const authorQuery = searchParams.get('author') ?? DEFAULT_FILTERS.authorQuery;
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
  const setAuthorQuery = useCallback((v: string) => setParam('author', v, DEFAULT_FILTERS.authorQuery), [setParam]);

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
    kindFilter !== DEFAULT_FILTERS.kindFilter || authorQuery !== DEFAULT_FILTERS.authorQuery;

  const resetFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('replies');
      next.delete('media');
      next.delete('lang');
      next.delete('platform');
      next.delete('kind');
      next.delete('customKind');
      next.delete('author');
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
    return parts.join(' ');
  }, [searchQuery, language, mediaType, protocols, kindsOverride, hasKindMediaConflict]);

  // Active filter labels for the summary / empty state hints
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (!includeReplies) labels.push('No replies');
    if (mediaType !== 'all') labels.push({ images: 'Images', videos: 'Videos', vines: 'Shorts & Vines', none: 'No media' }[mediaType] ?? mediaType);
    if (language !== 'global') labels.push(language.toUpperCase());
    if (platform !== 'nostr') labels.push({ activitypub: 'Mastodon', atproto: 'Bluesky' }[platform] ?? platform);
    if (kindFilter !== 'all' && kindFilter !== 'custom') {
      const opt = kindOptions.find(o => o.value === kindFilter);
      if (opt) labels.push(opt.label);
    } else if (kindFilter === 'custom' && customKindText) {
      labels.push(`Kind: ${customKindText}`);
    }
    if (authorQuery) labels.push(`Author: ${authorQuery.slice(0, 12)}…`);
    return labels;
  }, [includeReplies, mediaType, language, platform, kindFilter, customKindText, authorQuery, kindOptions]);

  // Hooks
  const { posts, isLoading: postsLoading } = useStreamPosts(searchQuery, {
    includeReplies,
    mediaType,
    language,
    protocols,
    kindsOverride,
    authorPubkey: authorQuery || undefined,
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
                <PopoverContent align="end" className="w-72 p-4 space-y-4">

                  {/* Header with reset button */}
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Filters</span>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                        onClick={resetFilters}
                      >
                        <RotateCcw className="size-3" />
                        Reset all
                      </Button>
                    )}
                  </div>

                  <Separator />

                  {/* Including replies */}
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">Include replies</span>
                    <Switch
                      checked={includeReplies}
                      onCheckedChange={setIncludeReplies}
                    />
                  </div>

                  <Separator />

                  {/* Author scope */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <User className="size-3.5 text-muted-foreground" />
                      <span className="font-medium text-sm">Author</span>
                    </div>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="npub1… or hex pubkey"
                        value={authorQuery}
                        onChange={(e) => setAuthorQuery(e.target.value)}
                        className="bg-secondary/50 border-border focus-visible:ring-1 rounded-lg text-sm pr-7"
                      />
                      {authorQuery && (
                        <button
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setAuthorQuery('')}
                          aria-label="Clear author"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Media type */}
                  <div className="space-y-2">
                    <span className="font-medium text-sm">Media type</span>
                    <Select value={mediaType} onValueChange={setMediaType}>
                      <SelectTrigger className="w-full bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          { value: 'all', label: 'All media' },
                          { value: 'images', label: 'Images', icon: Image },
                          { value: 'videos', label: 'Videos', icon: Video },
                          { value: 'vines', label: 'Shorts & Vines', icon: Film },
                          { value: 'none', label: 'No media' },
                        ].map(({ value, label, icon: Icon }) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
                              {label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

                  {/* Event kind */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Hash className="size-3.5 text-muted-foreground" />
                      <span className="font-medium text-sm">Event kind</span>
                    </div>
                    <Select value={kindFilter} onValueChange={setKindFilter}>
                      <SelectTrigger className="w-full bg-secondary/50">
                        <SelectValue placeholder="All kinds" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All kinds</SelectItem>
                        {kindOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="flex items-center gap-2">
                              {opt.icon && <opt.icon className="size-3.5 shrink-0 text-muted-foreground" />}
                              {opt.label}
                            </span>
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom kind…</SelectItem>
                      </SelectContent>
                    </Select>
                    {kindFilter === 'custom' && (
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 1, 30023"
                        value={customKindText}
                        onChange={(e) => setCustomKindText(e.target.value)}
                        className="bg-secondary/50 border-border focus-visible:ring-1 rounded-lg text-sm"
                      />
                    )}
                    {/* Conflict warning */}
                    {hasKindMediaConflict && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                        <Info className="size-3.5 shrink-0 mt-0.5" />
                        Media type and Event kind filters may conflict. Kind filter takes precedence.
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Platform */}
                  <div className="space-y-2">
                    <span className="font-medium text-sm">Show posts from</span>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger className="w-full bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nostr">Nostr</SelectItem>
                        <SelectItem value="activitypub">Mastodon</SelectItem>
                        <SelectItem value="atproto">Bluesky</SelectItem>
                      </SelectContent>
                    </Select>
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
