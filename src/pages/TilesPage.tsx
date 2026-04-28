/**
 * `/tiles` — app-store style marketplace for nostr-canvas tiles.
 *
 * Layout (single page, no tabs):
 *   ┌──────────────────────────────────┐
 *   │  Tiles                    ⚙      │  ← PageHeader + Settings gear
 *   │  🔍 Search…                       │  ← search bar (debounced)
 *   │  ── Featured ──────────────────  │  ← horizontal scroll, 6–8 tiles
 *   │  ── All tiles ─────────────────  │  ← Nx2 grid, paginated by recency
 *   └──────────────────────────────────┘
 *
 * When the search bar has a query:
 *   - Featured strip is hidden.
 *   - The grid filters client-side by name, summary, and nip-05 prefix.
 *
 * The ⚙ gear navigates to `/settings/tiles` (My Tiles — published + installed).
 */

import {
  useDeferredValue,
  useMemo,
  useState,
} from 'react';
import { useSeoMeta } from '@unhead/react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { Link } from 'react-router-dom';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { NSchema as n } from '@nostrify/nostrify';
import {
  AlertTriangle,
  CheckCircle2,
  LayoutGrid,
  Search,
  Settings,
} from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useInstalledTiles } from '@/hooks/useInstalledTiles';
import { useCanvasGate } from '@/lib/nostr-canvas/canvasGate';
import {
  getDTag,
  parseTileIdentifier,
  tileEventToNaddr,
  tileVerificationState,
} from '@/lib/nostr-canvas/identifiers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

// Suppress unused import warning — NSchema is consumed indirectly via nostrify
void n;

const TILE_KIND = 30207;
const TILE_SCHEMA = '1';
const PAGE_SIZE = 24;

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

function tagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([t]) => t === name)?.[1];
}
function tileDisplayName(e: NostrEvent) { return tagValue(e, 'name') ?? getDTag(e) ?? e.id.slice(0, 8); }
function tileSummary(e: NostrEvent) { return tagValue(e, 'summary'); }
function tileImage(e: NostrEvent) { return sanitizeUrl(tagValue(e, 'image')); }
function tileVersion(e: NostrEvent) { return tagValue(e, 'v'); }
function tileNip05(e: NostrEvent): string | null {
  const d = getDTag(e);
  if (!d) return null;
  return parseTileIdentifier(d)?.nip05 ?? null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TilesPage() {
  const { config } = useAppContext();
  const { nostr } = useNostr();

  const [rawQuery, setRawQuery] = useState('');
  // useDeferredValue gives us cheap debouncing without a useEffect+timer:
  // React batches the deferred update during idle time so the input stays
  // responsive even while the filter recomputes.
  const query = useDeferredValue(rawQuery.trim().toLowerCase());

  const [page, setPage] = useState(0);
  // Reset to page 0 whenever the query changes.
  const effectivePage = query ? 0 : page;

  useSeoMeta({
    title: `Tiles | ${config.appName}`,
    description: 'Browse, install, and manage nostr-canvas tiles.',
  });

  // Single query for all marketplace tiles — we handle featured vs browse
  // client-side so we don't need two relay round-trips.
  const { data: allEvents, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['tiles-all'],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const results = await nostr.query(
        [{ kinds: [TILE_KIND], '#t': ['nostr-canvas-tile'], limit: 500 }],
        { signal },
      );
      return [...results]
        .filter((e) => tagValue(e, 's') === TILE_SCHEMA)
        .sort((a, b) => b.created_at - a.created_at);
    },
  });

  // Featured = tiles by curatorPubkey, capped at 8.
  const featuredEvents = useMemo(() => {
    if (!allEvents || !config.curatorPubkey) return [];
    return allEvents.filter((e) => e.pubkey === config.curatorPubkey).slice(0, 8);
  }, [allEvents, config.curatorPubkey]);

  // Filter for search — name, summary, and nip-05 prefix.
  const filteredEvents = useMemo(() => {
    if (!allEvents) return [];
    if (!query) return allEvents;
    return allEvents.filter((e) => {
      const name = tileDisplayName(e).toLowerCase();
      const summary = (tileSummary(e) ?? '').toLowerCase();
      const nip05 = (tileNip05(e) ?? '').toLowerCase();
      return name.includes(query) || summary.includes(query) || nip05.includes(query);
    });
  }, [allEvents, query]);

  const totalPages = Math.ceil(filteredEvents.length / PAGE_SIZE);
  const pageEvents = filteredEvents.slice(
    effectivePage * PAGE_SIZE,
    (effectivePage + 1) * PAGE_SIZE,
  );

  const { installedNaddrs } = useInstalledTiles();
  const installedSet = useMemo(() => new Set(installedNaddrs), [installedNaddrs]);

  const { requestGate } = useCanvasGate();
  // Open the gate so feed/registration hooks are ready even on the browse page.
  useMemo(() => { requestGate(); }, [requestGate]);

  return (
    <main className="pb-16 sidebar:pb-0">
      <PageHeader
        title="Tiles"
        icon={<LayoutGrid className="size-5" />}
      >
        <Button variant="ghost" size="icon" asChild className="ml-auto" aria-label="My Tiles">
          <Link to="/settings/tiles">
            <Settings className="size-5" />
          </Link>
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="sticky top-mobile-bar sidebar:top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border px-4 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Search by name, description, or nip-05…"
            value={rawQuery}
            onChange={(e) => { setRawQuery(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      <div className="px-4 pt-5 space-y-8">

        {/* Featured strip — hidden during search */}
        {!query && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Featured
            </h2>
            {isLoading ? (
              <FeaturedSkeleton />
            ) : featuredEvents.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory">
                {featuredEvents.map((event) => (
                  <FeaturedCard
                    key={event.id}
                    event={event}
                    installedSet={installedSet}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {config.curatorPubkey
                  ? 'No featured tiles yet.'
                  : 'No curator configured for this instance.'}
              </p>
            )}
          </section>
        )}

        {/* All tiles grid */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {query ? `Results for "${rawQuery.trim()}"` : 'All tiles'}
          </h2>

          {isLoading ? (
            <TileGridSkeleton />
          ) : pageEvents.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <p className="text-sm font-semibold">
                  {query ? 'No tiles match your search.' : 'No tiles found on your current relays.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {pageEvents.map((event) => (
                  <TileCard
                    key={event.id}
                    event={event}
                    installedSet={installedSet}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={effectivePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {effectivePage + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={effectivePage >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Featured card — tall portrait card for the horizontal strip
// ---------------------------------------------------------------------------

function FeaturedCard({
  event,
  installedSet,
}: {
  event: NostrEvent;
  installedSet: ReadonlySet<string>;
}) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const naddr = tileEventToNaddr(event);
  const isInstalled = installedSet.has(naddr);
  const image = tileImage(event);
  const name = tileDisplayName(event);
  const summary = tileSummary(event);
  const parts = parseTileIdentifier(getDTag(event) ?? '');

  return (
    <Link
      to={`/tiles/${naddr}`}
      className={cn(
        'group relative flex-none w-40 sm:w-48 snap-start overflow-hidden rounded-xl border bg-card transition-colors',
        isInstalled
          ? 'border-emerald-500/40 hover:border-emerald-500/70'
          : 'border-border hover:border-primary/40',
      )}
    >
      {/* Square image */}
      <div className="relative aspect-square bg-gradient-to-br from-primary/10 to-muted/20">
        {image ? (
          <img
            src={image}
            alt=""
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
            <LayoutGrid className="size-10" />
          </div>
        )}
        {isInstalled && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-emerald-500/95 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm">
            <CheckCircle2 className="size-3" strokeWidth={2.5} />
          </span>
        )}
      </div>
      {/* Meta */}
      <div className="p-2 space-y-0.5">
        <p className="truncate text-xs font-semibold group-hover:text-primary">{name}</p>
        {summary && <p className="line-clamp-2 text-[11px] text-muted-foreground leading-tight">{summary}</p>}
        <p className="truncate text-[10px] text-muted-foreground/70">
          {metadata?.name ?? parts?.nip05 ?? ''}
        </p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Grid card — standard landscape card for the main grid
// ---------------------------------------------------------------------------

function TileCard({
  event,
  installedSet,
}: {
  event: NostrEvent;
  installedSet: ReadonlySet<string>;
}) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;

  const verification = tileVerificationState(event, metadata);

  // Hide structurally malformed tiles — they can't be installed anyway.
  if (verification === 'malformed') return null;

  const showUnverifiedBadge = verification === 'unverified' && !author.isLoading;

  const naddr = tileEventToNaddr(event);
  const isInstalled = installedSet.has(naddr);
  const image = tileImage(event);
  const summary = tileSummary(event);
  const version = tileVersion(event);
  const name = tileDisplayName(event);
  const ident = getDTag(event);
  const parts = ident ? parseTileIdentifier(ident) : null;

  return (
    <Link
      to={`/tiles/${naddr}`}
      className={cn(
        'group block overflow-hidden rounded-xl border bg-card transition-colors',
        isInstalled
          ? 'border-emerald-500/40 hover:border-emerald-500/70'
          : 'border-border hover:border-primary/40',
      )}
    >
      <div className="relative aspect-[16/9] bg-gradient-to-br from-primary/10 to-muted/20">
        {image ? (
          <img
            src={image}
            alt=""
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
            <LayoutGrid className="size-10" />
          </div>
        )}
        {isInstalled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="img"
                aria-label="Installed"
                onClick={(e) => e.preventDefault()}
                className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500/95 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm"
              >
                <CheckCircle2 className="size-3.5" strokeWidth={2.5} />
                Installed
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              You have this tile installed.
            </TooltipContent>
          </Tooltip>
        )}
        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          {showUnverifiedBadge && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="img"
                  aria-label="Unverified author"
                  className="flex size-6 items-center justify-center rounded-full bg-yellow-400/90 text-yellow-950 shadow-sm backdrop-blur-sm"
                  onClick={(e) => e.preventDefault()}
                >
                  <AlertTriangle className="size-3.5" strokeWidth={2.5} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                The author's NIP-05 doesn't match this tile's namespace. Install only if you trust the author.
              </TooltipContent>
            </Tooltip>
          )}
          {version && (
            <span className="rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              v{version}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-1 p-3">
        <h3 className="truncate text-sm font-semibold group-hover:text-primary">{name}</h3>
        {summary && <p className="line-clamp-2 text-xs text-muted-foreground">{summary}</p>}
        <p className="truncate text-xs text-muted-foreground/80">
          by {metadata?.display_name ?? metadata?.name ?? parts?.nip05 ?? 'unknown'}
        </p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function FeaturedSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden -mx-4 px-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex-none w-40 sm:w-48 overflow-hidden rounded-xl border border-border bg-card">
          <Skeleton className="aspect-square w-full" />
          <div className="p-2 space-y-1">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TileGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <Skeleton className="aspect-[16/9] w-full" />
          <div className="space-y-1.5 p-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
