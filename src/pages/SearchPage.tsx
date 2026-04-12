import { useSeoMeta } from '@unhead/react';
import { useAppContext } from '@/hooks/useAppContext';
import {
  SlidersHorizontal,
  Compass,
  Search as SearchIcon,
  UserRoundCheck,
  User,
  RotateCcw,
  BookmarkPlus,
  Check,
  Loader2,
  Globe, Users, UserSearch,
  Clock, Flame, TrendingUp,
  Share2,
} from 'lucide-react';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import { Link, useSearchParams } from 'react-router-dom';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { HelpTip } from '@/components/HelpTip';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmojifiedText } from '@/components/CustomEmoji';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildKindOptions } from '@/lib/feedFilterUtils';
import { KindPicker, AuthorChip, AuthorFilterDropdown } from '@/components/SavedFeedFiltersEditor';
import { useSearchProfiles } from '@/hooks/useSearchProfiles';
import { useAuthor } from '@/hooks/useAuthor';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useFeed, type FeedItem } from '@/hooks/useFeed';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileTabs } from '@/hooks/useProfileTabs';
import { usePublishProfileTabs } from '@/hooks/usePublishProfileTabs';
import { useFollowList } from '@/hooks/useFollowActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useUserLists, useMatchedListId } from '@/hooks/useUserLists';
import { useFollowPacks } from '@/hooks/useFollowPacks';

import { ListPackPicker } from '@/components/SavedFeedFiltersEditor';

import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { cn, parseKindFilter } from '@/lib/utils';
import { shareOrCopy } from '@/lib/share';
import { buildSpellTags } from '@/lib/spellEngine';
import { useLayoutOptions, useNavHidden } from '@/contexts/LayoutContext';
import { PageHeader } from '@/components/PageHeader';
import { isRepostKind, parseRepostContent, shouldHideFeedEvent } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import { useMuteList } from '@/hooks/useMuteList';
import { nip19 } from 'nostr-tools';

type TabType = 'feeds' | 'packs' | 'posts' | 'accounts';

const VALID_TABS: TabType[] = ['feeds', 'packs', 'posts', 'accounts'];

function parseTab(value: string | null): TabType {
  return VALID_TABS.includes(value as TabType) ? (value as TabType) : 'feeds';
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
    title: `Discover | ${config.appName}`,
    description: 'Discover feeds, posts, and accounts on Nostr',
  });

  useLayoutOptions({ hasSubHeader: true });
  const navHidden = useNavHidden();

  const [searchParams, setSearchParams] = useSearchParams();

  // Derive tab directly from URL — single source of truth
  const activeTab = parseTab(searchParams.get('tab'));

  // SearchPage only tracks the debounced value — raw keystroke state lives in
  // the SearchInput child component so typing doesn't re-render the whole page.
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchParams.get('q') ?? '');
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

  /** Replace the current author list with the pubkeys from a Follow Set or Pack. */
  const setAuthorsFromList = useCallback((pubkeys: string[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('author');
      pubkeys.forEach((pk) => next.append('author', pk));
      next.set('authorScope', 'people');
      return next;
    }, { replace: true });
  }, [setSearchParams]);



  // Update tab in URL
  const setActiveTab = useCallback((tab: TabType) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'feeds') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Guard to prevent the URL→state sync from clobbering the input
  // when we ourselves just wrote to the URL.
  const internalUrlUpdate = useRef(false);

  // Sync search query state → URL (debounced to avoid disrupting typing).
  // Intentionally omits `searchParams` from deps — including it causes a
  // feedback loop: writing to the URL updates searchParams, which re-triggers
  // this effect, forcing extra renders on every keystroke.
  // The functional updater form of setSearchParams already receives the latest
  // params, so we don't need searchParams in scope here.
  useEffect(() => {
    const trimmed = debouncedSearchQuery.trim();
    internalUrlUpdate.current = true;
    setSearchParams((prev) => {
      const currentQ = prev.get('q') ?? '';
      if (trimmed === currentQ) {
        // No change — return the same object so React Router skips a history update.
        internalUrlUpdate.current = false;
        return prev;
      }
      const next = new URLSearchParams(prev);
      if (trimmed) {
        next.set('q', trimmed);
      } else {
        next.delete('q');
      }
      return next;
    }, { replace: true });
  }, [debouncedSearchQuery, setSearchParams]);

  // Sync URL → debounced query state (e.g., sidebar search or browser navigation)
  useEffect(() => {
    // Skip if we just wrote to the URL ourselves (avoids clobbering mid-typing input)
    if (internalUrlUpdate.current) {
      internalUrlUpdate.current = false;
      return;
    }
    const q = searchParams.get('q') ?? '';
    if (q !== debouncedSearchQuery.trim()) {
      setDebouncedSearchQuery(q);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // NOTE: Previously this redirected NIP-19/NIP-05 identifiers away from the
  // search page. Now identifiers are handled as autocomplete suggestions in the
  // search dropdowns, and submitting always performs a text search.

  const protocols = useMemo(() => [platform], [platform]);

  const kindOptions = useMemo(() => buildKindOptions(), []);

  // All kind numbers available in the picker — used as the "all kinds" default.
  const allKindNumbers = useMemo(() => kindOptions.map((o) => Number(o.value)), [kindOptions]);

  // Resolve kindsOverride from the current kind filter state.
  // "all" means every kind in the picker list, not undefined (which would let
  // useStreamPosts fall back to only the user's enabled feed-settings kinds).
  const kindsOverride = useMemo<number[]>(
    () => kindFilter === 'all' ? allKindNumbers : (parseKindFilter(kindFilter, customKindText) ?? allKindNumbers),
    [kindFilter, customKindText, allKindNumbers],
  );

  // Detect kind + media type conflict: a specific kind is selected AND a media type is set
  const hasKindMediaConflict = kindFilter !== 'all' && kindsOverride.length > 0 && mediaType !== 'all';

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
    if (debouncedSearchQuery.trim()) parts.push(debouncedSearchQuery.trim());
    if (language !== 'global') parts.push(`language:${language}`);
    const isDedicatedKindQuery = kindFilter === 'all' && (mediaType === 'vines' || mediaType === 'images' || mediaType === 'videos');
    if (!isDedicatedKindQuery && !hasKindMediaConflict) {
      if (mediaType === 'images') { parts.push('media:true'); parts.push('video:false'); }
      else if (mediaType === 'videos') parts.push('video:true');
      else if (mediaType === 'none') parts.push('media:false');
    }
    if (sort === 'hot') parts.push('sort:hot');
    else if (sort === 'trending') parts.push('sort:trending');
    return parts.join(' ');
  }, [debouncedSearchQuery, language, mediaType, protocols, hasKindMediaConflict, sort, kindFilter]);

  // Active filter labels for the summary / empty state hints
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (!includeReplies) labels.push('No replies');
    if (mediaType !== 'all') labels.push({ images: 'Images', videos: 'Videos', vines: 'Shorts & Divines', none: 'No media' }[mediaType] ?? mediaType);
    if (language !== 'global') labels.push(language.toUpperCase());
    if (platform !== 'nostr') labels.push({ activitypub: 'Mastodon', atproto: 'Bluesky' }[platform] ?? platform);
    if (sort !== 'recent') labels.push(sort === 'hot' ? 'Hot' : 'Trending');
    if (kindFilter !== 'all' && kindFilter !== 'custom') {
      const kindValues = kindFilter.split(',').filter(Boolean);
      if (kindValues.length === 1) {
        const opt = kindOptions.find(o => o.value === kindValues[0]);
        if (opt) labels.push(opt.label);
        else labels.push(`Kind ${kindValues[0]}`);
      } else if (kindValues.length > 1) {
        labels.push(`${kindValues.length} kinds`);
      }
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
  const { lists } = useUserLists();
  const { data: followPacks = [] } = useFollowPacks();
  const { savedFeeds, addSavedFeed, isPending: isSavingFeed } = useSavedFeeds();
  const profileTabsQuery = useProfileTabs(user?.pubkey);
  const { publishProfileTabs, isPending: isPublishingTabs } = usePublishProfileTabs();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const [savePopoverOpen, setSavePopoverOpen] = useState(false);
  const [saveFeedLabel, setSaveFeedLabel] = useState('');
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const listPickerValue = useMatchedListId(authorPubkeys);

  // 'people' scope with explicit authors = user-specific; not eligible for profile tab
  const isAuthorSpecific = authorScope === 'people' && authorPubkeys.length > 0;

  // Build spell tags from the current search state
  const currentSpellTags = useMemo(() => {
    let authors: string[] | undefined;
    if (authorScope === 'follows') authors = ['$contacts'];
    else if (authorScope === 'people' && authorPubkeys.length > 0) authors = authorPubkeys;

    return buildSpellTags({
      name: saveFeedLabel.trim() || 'Search',
      kinds: kindsOverride && kindsOverride.length > 0 ? kindsOverride : undefined,
      authors,
      search: debouncedSearchQuery.trim() || undefined,
      includeReplies: includeReplies ? undefined : false,
      media: mediaType !== 'all' ? mediaType : undefined,
      language: language !== 'global' ? language : undefined,
      platform: platform !== 'nostr' ? platform : undefined,
      sort: sort !== 'recent' ? sort : undefined,
    });
  }, [debouncedSearchQuery, kindsOverride, authorScope, authorPubkeys, includeReplies, mediaType, language, platform, sort, saveFeedLabel]);

  // Build the current filter from the search state (for saving)
  const currentFilter = useMemo(() => {
    const filter: Record<string, unknown> = {};
    if (debouncedSearchQuery.trim()) filter.search = debouncedSearchQuery.trim();
    if (kindsOverride && kindsOverride.length > 0) filter.kinds = kindsOverride;
    if (authorScope === 'follows') filter.authors = ['$follows'];
    else if (authorScope === 'people' && authorPubkeys.length > 0) filter.authors = authorPubkeys;
    return filter;
  }, [debouncedSearchQuery, kindsOverride, authorScope, authorPubkeys]);

  const currentFilterKey = useMemo(() => JSON.stringify(currentFilter), [currentFilter]);
  const alreadySaved = savedFeeds.some((f) => JSON.stringify(f.filter) === currentFilterKey);

  const handleSaveFeed = async () => {
    if (!saveFeedLabel.trim() || isSavingFeed) return;

    const vars: import('@/lib/profileTabsEvent').TabVarDef[] = [];
    if (authorScope === 'follows' && user) {
      vars.push({ name: '$follows', tagName: 'p', pointer: `a:3:${user.pubkey}:` });
    }

    await addSavedFeed(saveFeedLabel.trim(), currentFilter, vars);
    setSavePopoverOpen(false);
    setSaveFeedLabel('');
    setSavedJustNow(true);
    setTimeout(() => setSavedJustNow(false), 2000);
  };

  const handleSaveProfileTab = async () => {
    if (!saveFeedLabel.trim() || isPublishingTabs || !user) return;

    // Build filter for the profile tab
    const tabFilter: Record<string, unknown> = {};
    if (debouncedSearchQuery.trim()) tabFilter.search = debouncedSearchQuery.trim();
    if (kindsOverride && kindsOverride.length > 0) tabFilter.kinds = kindsOverride;
    if (authorScope === 'follows') tabFilter.authors = ['$follows'];
    else if (authorScope === 'people' && authorPubkeys.length > 0) tabFilter.authors = authorPubkeys;

    const existing = profileTabsQuery.data ?? { tabs: [], vars: [] };
    const newVars = [...existing.vars];
    if (authorScope === 'follows' && !newVars.find((v) => v.name === '$follows')) {
      newVars.push({ name: '$follows', tagName: 'p', pointer: `a:3:${user.pubkey}:` });
    }

    await publishProfileTabs({
      tabs: [...existing.tabs, { label: saveFeedLabel.trim(), filter: tabFilter }],
      vars: newVars,
    });
    setSavePopoverOpen(false);
    setSaveFeedLabel('');
    setSavedJustNow(true);
    setTimeout(() => setSavedJustNow(false), 2000);
  };

  const handleShareSpell = async () => {
    if (!saveFeedLabel.trim() || isSharing || !user) return;
    setIsSharing(true);
    try {
      const tags = currentSpellTags.map(([t, ...rest]) =>
        t === 'name' ? ['name', saveFeedLabel.trim()] :
        t === 'alt' ? ['alt', `Spell: ${saveFeedLabel.trim()}`] :
        [t, ...rest]
      );
      const event = await publishEvent({ kind: 777, content: '', tags, created_at: Math.floor(Date.now() / 1000) });
      const neventId = nip19.neventEncode({ id: event.id, author: event.pubkey, kind: event.kind });
      const url = `${window.location.origin}/${neventId}`;
      const result = await shareOrCopy(url, saveFeedLabel.trim());
      if (result === 'copied') {
        toast({ title: 'Link copied to clipboard' });
      }
      setSavePopoverOpen(false);
      setSaveFeedLabel('');
    } catch (err) {
      toast({ title: 'Failed to share spell', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setIsSharing(false);
    }
  };

  // Resolve author pubkeys for the stream
  const streamAuthorPubkeys = authorScope === 'follows'
    ? followPubkeys
    : authorScope === 'people' && authorPubkeys.length > 0
      ? authorPubkeys
      : undefined;

  const { posts, isLoading: postsLoading, newPostCount, flushStreamBuffer, flushedIds } = useStreamPosts(debouncedSearchQuery, {
    includeReplies,
    mediaType,
    language,
    protocols,
    kindsOverride,
    authorPubkeys: streamAuthorPubkeys,
    sort,
  });
  const { data: profiles, isLoading: profilesLoading, followedPubkeys } = useSearchProfiles(activeTab === 'accounts' ? debouncedSearchQuery : '');

  // Feeds tab: stream kind:777 spell events with From + Sort filters only
  const {
    posts: feedSpells,
    isLoading: feedsLoading,
    newPostCount: feedsNewCount,
    flushStreamBuffer: flushFeedsBuffer,
    flushedIds: feedsFlushedIds,
  } = useStreamPosts(activeTab === 'feeds' ? debouncedSearchQuery : '', {
    includeReplies: true,
    mediaType: 'all',
    kindsOverride: [777],
    authorPubkeys: activeTab === 'feeds' ? streamAuthorPubkeys : undefined,
    sort: activeTab === 'feeds' ? sort : 'recent',
  });

  // Packs tab: use useFeed to get full events with all tags (including image)
  const packsFeedQuery = useFeed('global', { kinds: [39089, 30000] });

  const handleRefresh = useCallback(async () => {
    if (activeTab === 'feeds') {
      flushFeedsBuffer();
    } else if (activeTab === 'packs') {
      packsFeedQuery.refetch();
    } else {
      flushStreamBuffer();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab, flushStreamBuffer, flushFeedsBuffer, packsFeedQuery]);

  return (
    <main className="flex-1 min-w-0">
      <PageHeader title="Discover" icon={<Compass className="size-5" />} />
      <SubHeaderBar>
        <TabButton label="Feeds" active={activeTab === 'feeds'} onClick={() => setActiveTab('feeds')} />
        <TabButton label="Packs" active={activeTab === 'packs'} onClick={() => setActiveTab('packs')} />
        <TabButton label="Posts" active={activeTab === 'posts'} onClick={() => setActiveTab('posts')} />
        <TabButton label="Accounts" active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')} />
      </SubHeaderBar>
      <div style={{ height: ARC_OVERHANG_PX }} />

      {/* Search input bar — always rendered right after tabs, like ComposeBox on Feed */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <SearchInput
            initialValue={debouncedSearchQuery}
            onDebouncedChange={setDebouncedSearchQuery}
          />

          {/* Add to feed button (posts tab only) */}
          {activeTab === 'posts' && user && (
            <div className={cn(!debouncedSearchQuery.trim() && !hasActiveFilters ? 'hidden' : undefined)}>
              <Popover open={savePopoverOpen} onOpenChange={(o) => {
                setSavePopoverOpen(o);
                if (o && !saveFeedLabel) {
                  if (debouncedSearchQuery.trim()) {
                    setSaveFeedLabel(debouncedSearchQuery.trim());
                  } else if (listPickerValue) {
                    const matched =
                      listPickerValue.startsWith('set:')
                        ? lists.find((l) => l.id === listPickerValue.slice(4))?.title
                        : followPacks.find((p) => p.id === listPickerValue.slice(5))?.title;
                    if (matched) setSaveFeedLabel(matched);
                  }
                }
              }}>
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
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFeed(); }}
                        className="bg-secondary/50 border-border focus-visible:ring-1 text-base md:text-sm"
                        autoFocus
                      />
                      <div className="space-y-1">
                        <SaveDestinationRow
                          icon={<BookmarkPlus className="size-4 text-muted-foreground" />}
                          label="Home feed"
                          description="Tab on your home page"
                          onClick={() => handleSaveFeed()}
                          disabled={!saveFeedLabel.trim() || isSavingFeed || isPublishingTabs}
                          loading={isSavingFeed}
                        />
                        {!isAuthorSpecific && (
                          <SaveDestinationRow
                            icon={<User className="size-4 text-muted-foreground" />}
                            label="Profile tab"
                            description="Your posts matching this search"
                            onClick={() => handleSaveProfileTab()}
                            disabled={!saveFeedLabel.trim() || isSavingFeed || isPublishingTabs}
                            loading={isPublishingTabs}
                          />
                        )}
                        <SaveDestinationRow
                          icon={<Share2 className="size-4 text-muted-foreground" />}
                          label="Share"
                          description="Publish and share a link"
                          onClick={() => handleShareSpell()}
                          disabled={!saveFeedLabel.trim() || isSavingFeed || isPublishingTabs || isSharing}
                          loading={isSharing}
                        />
                      </div>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Filter popover (posts, feeds, and packs tabs) */}
          {(activeTab === 'posts' || activeTab === 'feeds' || activeTab === 'packs') && (
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

                {/* Author scope */}
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
                        onClick={() => setAuthorScope(scope as AuthorScope)}
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
                      {authorPubkeys.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {authorPubkeys.map((pk) => (
                            <AuthorChip key={pk} pubkey={pk} onRemove={() => {
                              const next = authorPubkeys.filter((p) => p !== pk);
                              setSearchParams((prev) => {
                                const n = new URLSearchParams(prev);
                                n.delete('author');
                                next.forEach((p) => n.append('author', p));
                                if (next.length === 0) n.delete('authorScope');
                                return n;
                              }, { replace: true });
                            }} />
                          ))}
                        </div>
                      )}
                      <AuthorFilterDropdown onCommit={(pubkey) => {
                        if (!authorPubkeys.includes(pubkey)) {
                          setSearchParams((prev) => {
                            const n = new URLSearchParams(prev);
                            n.append('author', pubkey);
                            n.set('authorScope', 'people');
                            return n;
                          }, { replace: true });
                        }
                      }} />
                      <ListPackPicker
                        lists={lists}
                        followPacks={followPacks}
                        value={listPickerValue}
                        onSelectPubkeys={setAuthorsFromList}
                      />
                    </div>
                  )}
                </div>
                <Separator />

                {/* Sort */}
                <div className="space-y-1.5">
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

                {/* Posts-only filters */}
                {activeTab === 'posts' && (
                  <>
                    <Separator />

                    {/* Media + Protocol */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">Media</span>
                        <Select value={mediaType} onValueChange={(v) => setMediaType(v)}>
                          <SelectTrigger className="w-full bg-secondary/50 h-8 text-base md:text-xs">
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
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">Protocol <HelpTip faqId="vs-mastodon-bluesky" iconSize="size-3" /></span>
                        <Select value={platform} onValueChange={(v) => setPlatform(v)}>
                          <SelectTrigger className="w-full bg-secondary/50 h-8 text-base md:text-xs">
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

                    {/* Language + Kind */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">Language</span>
                        <Select value={language} onValueChange={(v) => setLanguage(v)}>
                          <SelectTrigger className="w-full bg-secondary/50 h-8 text-base md:text-xs">
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
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">Kind</span>
                        <KindPicker value={kindFilter} options={kindOptions} onChange={(v) => setKindFilter(v)} />
                      </div>
                    </div>

                    {kindFilter === 'custom' && (
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 1, 30023"
                        value={customKindText}
                        onChange={(e) => setCustomKindText(e.target.value)}
                        className="bg-secondary/50 border-border focus-visible:ring-1 rounded-lg text-base md:text-xs h-8"
                      />
                    )}

                    {/* Include replies toggle */}
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Include replies</span>
                      <Switch checked={includeReplies} onCheckedChange={setIncludeReplies} className="scale-90" />
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Active filter summary chips (posts, feeds, and packs tabs) */}
        {(activeTab === 'posts' || activeTab === 'feeds' || activeTab === 'packs') && activeFilterLabels.length > 0 && (
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

        {/* NIP-50 search query debug block (posts tab only) */}
        {activeTab === 'posts' && debouncedSearchQuery.trim() && (
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

      <PullToRefresh onRefresh={handleRefresh}>
        {/* ─── Posts Tab ─── */}
        {activeTab === 'posts' && (
          <>
            {/* New posts pill — sticks below the SubHeaderBar arc, hides with nav.
                Mobile: top = MobileTopBar (2.5rem) + safe-area + SubHeaderBar (~2.5rem).
                Desktop: top = SubHeaderBar only (~2.5rem), no MobileTopBar. */}
            {newPostCount > 0 && (
              <div
                className={cn(
                  'sticky new-posts-pill z-10 flex justify-center pointer-events-none',
                  'max-sidebar:transition-opacity max-sidebar:duration-300 max-sidebar:ease-in-out',
                  navHidden && 'max-sidebar:opacity-0 max-sidebar:pointer-events-none',
                )}
                style={{ marginBottom: '-3rem' }}
              >
                <button
                  onClick={() => {
                    flushStreamBuffer();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="pointer-events-auto px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:bg-primary/90 transition-colors animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  {newPostCount} new post{newPostCount !== 1 ? 's' : ''}
                </button>
              </div>
            )}
            {/* Post results — stream */}
            {postsLoading && posts.length === 0 ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <PostSkeleton key={i} />
                ))}
              </div>
            ) : posts.length > 0 ? (
              <div>
                {posts.map((event) => {
                  const isNew = flushedIds.has(event.id);
                  if (isRepostKind(event.kind)) {
                    const embedded = parseRepostContent(event);
                    if (embedded) {
                      return <NoteCard key={event.id} event={embedded} repostedBy={event.pubkey} highlight={isNew} />;
                    }
                    return null;
                  }
                  return <NoteCard key={event.id} event={event} highlight={isNew} />;
                })}
              </div>
            ) : debouncedSearchQuery.trim() ? (
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
            <div>
              {debouncedSearchQuery.trim() ? (
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

        {/* ─── Packs Tab ─── */}
        {activeTab === 'packs' && (
          <PacksTabContent query={packsFeedQuery} />
        )}

        {/* ─── Feeds Tab ─── */}
        {activeTab === 'feeds' && (
          <>
            {feedsNewCount > 0 && (
              <div
                className={cn(
                  'sticky new-posts-pill z-10 flex justify-center pointer-events-none',
                  'max-sidebar:transition-opacity max-sidebar:duration-300 max-sidebar:ease-in-out',
                  navHidden && 'max-sidebar:opacity-0 max-sidebar:pointer-events-none',
                )}
                style={{ marginBottom: '-3rem' }}
              >
                <button
                  onClick={() => {
                    flushFeedsBuffer();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="pointer-events-auto px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:bg-primary/90 transition-colors animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  {feedsNewCount} new feed{feedsNewCount !== 1 ? 's' : ''}
                </button>
              </div>
            )}
            {feedsLoading && feedSpells.length === 0 ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <PostSkeleton key={i} />
                ))}
              </div>
            ) : feedSpells.length > 0 ? (
              <div>
                {feedSpells.map((event) => (
                  <NoteCard key={event.id} event={event} highlight={feedsFlushedIds.has(event.id)} />
                ))}
              </div>
            ) : (
              <EmptyState message={debouncedSearchQuery.trim() ? 'No feeds found matching your search.' : 'No feeds found. Check back soon!'} />
            )}
          </>
        )}
      </PullToRefresh>
    </main>
  );
}

/* ── Shared sub-components ── */

function AccountItem({ profile, isFollowed }: { profile: { pubkey: string; metadata: Record<string, unknown>; event?: { tags: string[][] } }; isFollowed: boolean }) {
  const npub = useMemo(() => nip19.npubEncode(profile.pubkey), [profile.pubkey]);
  const metadata = profile.metadata as { name?: string; nip05?: string; picture?: string; about?: string; bot?: boolean };
  const displayName = metadata?.name || genUserName(profile.pubkey);
  const profileAvatarShape = getAvatarShape(metadata);
  const tags = profile.event?.tags ?? [];

  return (
    <Link
      to={`/${npub}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <div className="relative shrink-0">
        <Avatar shape={profileAvatarShape} className="size-11">
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

const FOLLOWS_PAGE_SIZE = 30;

function FollowsList() {
  const { data: followData } = useFollowList();
  const pubkeys = useMemo(() => followData?.pubkeys ?? [], [followData]);
  const [visibleCount, setVisibleCount] = useState(FOLLOWS_PAGE_SIZE);
  const { ref: sentinelRef, inView } = useInView({ threshold: 0, rootMargin: '300px' });

  const visiblePubkeys = useMemo(() => pubkeys.slice(0, visibleCount), [pubkeys, visibleCount]);
  const hasMore = visibleCount < pubkeys.length;

  useEffect(() => {
    if (inView && hasMore) {
      setVisibleCount((c) => Math.min(c + FOLLOWS_PAGE_SIZE, pubkeys.length));
    }
  }, [inView, hasMore, pubkeys.length]);

  if (pubkeys.length === 0) {
    return <EmptyState message="Search for people by name or NIP-05 address." />;
  }

  return (
    <div className="divide-y divide-border">
      {visiblePubkeys.map((pubkey) => (
        <FollowItem key={pubkey} pubkey={pubkey} />
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <AccountSkeleton key={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function FollowItem({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
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
        <Avatar shape={avatarShape} className="size-11">
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

/** Renders the Packs tab using useFeed (same query path as /packs page). */
function PacksTabContent({ query }: { query: ReturnType<typeof useFeed> }) {
  const { muteItems } = useMuteList();
  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  const { data: rawData, isPending, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const packItems = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    return (rawData.pages as unknown as { items: FeedItem[] }[])
      .flatMap((page) => page.items)
      .filter((item) => {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        if (shouldHideFeedEvent(item.event)) return false;
        if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;
        return true;
      });
  }, [rawData?.pages, muteItems]);

  const showSkeleton = isPending || (isLoading && !rawData);

  if (showSkeleton) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (packItems.length === 0) {
    return <EmptyState message="No follow packs found. Check back soon!" />;
  }

  return (
    <div>
      {packItems.map((item) => (
        <NoteCard
          key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
          event={item.event}
          repostedBy={item.repostedBy}
        />
      ))}
      {hasNextPage && (
        <div ref={scrollRef} className="py-4">
          {isFetchingNextPage && (
            <div className="flex justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}
    </div>
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
 * Owns the raw keystroke state for the search box so that typing only
 * re-renders this small component, not the entire SearchPage.
 * Calls onDebouncedChange after 300 ms of inactivity.
 */
function SearchInput({
  initialValue,
  onDebouncedChange,
  className,
}: {
  initialValue: string;
  onDebouncedChange: (value: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const onDebouncedChangeRef = useRef(onDebouncedChange);
  onDebouncedChangeRef.current = onDebouncedChange;

  // Sync if the parent resets the value (e.g. browser back/forward)
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  // Debounce: call parent only after 300 ms of no typing
  useEffect(() => {
    const id = setTimeout(() => onDebouncedChangeRef.current(value), 300);
    return () => clearTimeout(id);
  }, [value]);

  return (
    <div className={cn('relative flex-1', className)}>
      <Input
        type="text"
        placeholder="Search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pr-10 bg-secondary/50 border-border focus-visible:ring-1 rounded-lg"
      />
      <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
    </div>
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


