/**
 * AppsPage — NIP-89 app directory for discovering Nostr applications (kind 31990).
 *
 * Features:
 * - Browsable grid of app cards with icon, name, description, platforms, supported kinds
 * - Client-side search filtering by name/description
 * - Filter by supported kind or tag
 * - Quality filtering: drops listings missing name, picture, about, or website
 */

import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { Layers, Loader2, Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

import { validateAppHandler } from '@/lib/appHandlerUtils';
import { KindInfoButton } from '@/components/KindInfoButton';
import { PageHeader } from '@/components/PageHeader';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';

const APP_HANDLER_KIND = 31990;
const PAGE_SIZE = 40;

const appsDef = getExtraKindDef('apps');

/** Parse the kind-0-style JSON content of a kind 31990 event. */
function parseAppMeta(event: NostrEvent): Record<string, string> {
  if (!event.content) return {};
  try {
    return JSON.parse(event.content);
  } catch {
    return {};
  }
}

/** Get the display name from an app handler event. */
function getAppName(event: NostrEvent): string {
  const meta = parseAppMeta(event);
  return meta.name || meta.display_name || event.tags.find(([n]) => n === 'name')?.[1] || '';
}

/** Get the app picture from an app handler event. */
function getAppPicture(event: NostrEvent): string | undefined {
  const meta = parseAppMeta(event);
  return meta.picture || event.tags.find(([n]) => n === 'picture')?.[1] || event.tags.find(([n]) => n === 'icon')?.[1];
}

/** Get description from an app handler event. */
function getAppAbout(event: NostrEvent): string {
  const meta = parseAppMeta(event);
  return meta.about || '';
}

/** Get all supported kinds from an event. */
function getSupportedKinds(event: NostrEvent): string[] {
  return event.tags.filter(([n]) => n === 'k').map(([, v]) => v);
}

/** Get all hashtags from an event. */
function getHashtags(event: NostrEvent): string[] {
  return event.tags.filter(([n]) => n === 't').map(([, v]) => v);
}

/** Get platforms from an event. */
function getPlatforms(event: NostrEvent): string[] {
  const platforms = new Set<string>();
  for (const [name] of event.tags) {
    if (name === 'web') platforms.add('Web');
    if (name === 'ios') platforms.add('iOS');
    if (name === 'android') platforms.add('Android');
  }
  return [...platforms];
}

/** Deduplicate addressable events: keep latest per pubkey+d-tag combo. */
function deduplicateAddressable(events: NostrEvent[]): NostrEvent[] {
  const map = new Map<string, NostrEvent>();
  for (const event of events) {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const key = `${event.pubkey}:${dTag}`;
    const existing = map.get(key);
    if (!existing || event.created_at > existing.created_at) {
      map.set(key, event);
    }
  }
  return [...map.values()];
}

/** Encode an addressable event into an naddr link. */
function encodeNaddr(event: NostrEvent): string {
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  return nip19.naddrEncode({
    kind: event.kind,
    pubkey: event.pubkey,
    identifier: dTag,
  });
}

/** Well-known kind numbers that apps commonly support, for the filter dropdown. */
const POPULAR_KINDS: { kind: string; label: string }[] = [
  { kind: '1', label: 'Notes' },
  { kind: '0', label: 'Profiles' },
  { kind: '30023', label: 'Articles' },
  { kind: '7', label: 'Reactions' },
  { kind: '6', label: 'Reposts' },
  { kind: '9735', label: 'Zaps' },
  { kind: '4', label: 'DMs' },
  { kind: '20', label: 'Photos' },
  { kind: '21', label: 'Videos' },
  { kind: '30311', label: 'Streams' },
  { kind: '31990', label: 'App Handlers' },
  { kind: '30617', label: 'Git Repos' },
  { kind: '31922', label: 'Calendar Events' },
];

// ── App Card ───────────────────────────────────────────────────────────────────

function AppCard({ event }: { event: NostrEvent }) {
  const name = getAppName(event);
  const picture = getAppPicture(event);
  const about = getAppAbout(event);
  const platforms = getPlatforms(event);
  const supportedKinds = getSupportedKinds(event);
  const link = `/${encodeNaddr(event)}`;

  return (
    <Link
      to={link}
      className="group block rounded-xl border border-border bg-card p-4 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start gap-3.5">
        {picture ? (
          <img
            src={picture}
            alt={name}
            className="size-14 rounded-xl object-cover shrink-0 shadow-sm group-hover:shadow-md transition-shadow"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="size-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="size-7 text-primary/50" />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1">
          <h3 className="font-semibold text-[15px] leading-snug truncate group-hover:text-primary transition-colors">
            {name}
          </h3>
          {about && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-snug">
              {about}
            </p>
          )}
        </div>
      </div>

      {/* Meta row: platforms + kind count */}
      <div className="flex items-center gap-2 flex-wrap mt-3">
        {platforms.map((p) => (
          <Badge key={p} variant="secondary" className="text-xs px-2 py-0">
            {p}
          </Badge>
        ))}
        {supportedKinds.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {supportedKinds.length} kind{supportedKinds.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </Link>
  );
}

function AppCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3.5">
        <Skeleton className="size-14 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-10 rounded-full" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AppsPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [infoOpen, setInfoOpen] = useState(false);

  useSeoMeta({
    title: `Apps | ${config.appName}`,
    description: 'Discover Nostr applications',
  });

  useLayoutOptions({ showFAB: false, hasSubHeader: !!user });

  // ── Query kind 31990 events ──
  const {
    data: rawData,
    isPending,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<NostrEvent[], Error>({
    queryKey: ['apps-feed', APP_HANDLER_KIND],
    queryFn: async ({ pageParam, signal }) => {
      const filter: Record<string, unknown> = {
        kinds: [APP_HANDLER_KIND],
        limit: PAGE_SIZE,
      };
      if (pageParam) filter.until = pageParam;

      return nostr.query(
        [filter as { kinds: number[]; limit: number; until?: number }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const { scrollRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    pageCount: rawData?.pages?.length,
  });

  const handleRefresh = usePageRefresh(['apps-feed']);

  // ── Process & filter events ──
  const allApps = useMemo(() => {
    if (!rawData?.pages) return [];
    const flat = rawData.pages.flat();
    // Deduplicate addressable events (keep latest per pubkey+d combo)
    const deduped = deduplicateAddressable(flat);
    // Quality filter: must have name, picture, about, website
    return deduped.filter(validateAppHandler);
  }, [rawData]);

  // Client-side search + kind filter
  const filteredApps = useMemo(() => {
    let result = allApps;

    // Kind filter
    if (kindFilter) {
      result = result.filter((e) => getSupportedKinds(e).includes(kindFilter));
    }

    // Search filter
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((e) => {
        const name = getAppName(e).toLowerCase();
        const about = getAppAbout(e).toLowerCase();
        const tags = getHashtags(e).map((t) => t.toLowerCase());
        return name.includes(q) || about.includes(q) || tags.some((t) => t.includes(q));
      });
    }

    return result;
  }, [allApps, search, kindFilter]);

  // Collect available kind filters from loaded data
  const availableKindFilters = useMemo(() => {
    const kindCounts = new Map<string, number>();
    for (const event of allApps) {
      for (const k of getSupportedKinds(event)) {
        kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1);
      }
    }
    // Use popular kinds that exist in the data, sorted by count
    return POPULAR_KINDS
      .filter((pk) => kindCounts.has(pk.kind))
      .sort((a, b) => (kindCounts.get(b.kind) ?? 0) - (kindCounts.get(a.kind) ?? 0));
  }, [allApps]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <PageHeader title="Apps" icon={sidebarItemIcon('apps', 'size-5')} backTo="/">
        {appsDef && <KindInfoButton kindDef={appsDef} icon={sidebarItemIcon('apps', 'size-5')} open={infoOpen} onOpenChange={setInfoOpen} />}
      </PageHeader>

      {/* Search + Filters bar */}
      <div className="px-4 pb-3 space-y-3 border-b border-border">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps..."
            className="pl-9 pr-9 h-9"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); searchInputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Kind filter chips */}
        {availableKindFilters.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            <button
              onClick={() => setKindFilter(null)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                kindFilter === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              All
            </button>
            {availableKindFilters.map(({ kind, label }) => (
              <button
                key={kind}
                onClick={() => setKindFilter(kindFilter === kind ? null : kind)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  kindFilter === kind
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="px-4 py-4">
        {isPending ? (
          <div className="grid grid-cols-1 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <AppCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="py-16 px-8 text-center">
            <p className="text-muted-foreground">
              {search || kindFilter
                ? 'No apps match your filters. Try broadening your search.'
                : 'No apps found. Check your relay connections or try again later.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredApps.map((event) => (
              <AppCard key={event.id} event={event} />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={scrollRef} className="h-1" />

        {/* Loading more indicator */}
        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
