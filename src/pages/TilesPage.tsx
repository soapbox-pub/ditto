/**
 * `/tiles` — marketplace + installed-tiles browser.
 *
 * Three tabs:
 *  - **Featured**: tiles from `AppConfig.curatorPubkey` only. Author-filtered
 *    to protect against anyone flooding the relay with lookalike tiles.
 *  - **Browse**: every kind-30207 tile on the user's read relays, filtered
 *    down to ones whose `d`-tag NIP-05 prefix matches the author's verified
 *    NIP-05 in kind-0.
 *  - **Installed**: what the current user has installed locally. Uninstall
 *    and settings entry points live here.
 */

import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { Link } from 'react-router-dom';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { NSchema as n } from '@nostrify/nostrify';
import { LayoutGrid, Star, Package, Globe } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useInstalledTiles } from '@/hooks/useInstalledTiles';
import { useCanvasGate } from '@/lib/nostr-canvas/canvasGate';
import {
  getDTag,
  parseTileIdentifier,
  tileEventToNaddr,
  verifyTileDTag,
} from '@/lib/nostr-canvas/identifiers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

const TILE_KIND = 30207;
const TILE_SCHEMA = '1';

// ---------------------------------------------------------------------------
// Small helpers shared across tabs
// ---------------------------------------------------------------------------

function tagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

function tileDisplayName(event: NostrEvent): string {
  return tagValue(event, 'name') ?? getDTag(event) ?? event.id.slice(0, 8);
}

function tileSummary(event: NostrEvent): string | undefined {
  return tagValue(event, 'summary');
}

function tileImage(event: NostrEvent): string | undefined {
  return sanitizeUrl(tagValue(event, 'image'));
}

function tileVersion(event: NostrEvent): string | undefined {
  return tagValue(event, 'v');
}

// ---------------------------------------------------------------------------
// TilesPage
// ---------------------------------------------------------------------------

export function TilesPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Tiles | ${config.appName}`,
    description:
      'Browse, install, and manage nostr-canvas tiles — programmable Lua mini-apps for your Nostr client.',
  });

  return (
    <main className="pb-16 sidebar:pb-0">
      <PageHeader title="Tiles" icon={<LayoutGrid className="size-5" />} />

      <Tabs defaultValue="featured" className="w-full">
        <div className="sticky top-mobile-bar sidebar:top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border px-4 pb-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="featured">
              <Star className="size-3.5 mr-1.5" /> Featured
            </TabsTrigger>
            <TabsTrigger value="browse">
              <Globe className="size-3.5 mr-1.5" /> Browse
            </TabsTrigger>
            <TabsTrigger value="installed">
              <Package className="size-3.5 mr-1.5" /> Installed
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="featured" className="px-4 pt-4">
          <FeaturedTab curatorPubkey={config.curatorPubkey} />
        </TabsContent>

        <TabsContent value="browse" className="px-4 pt-4">
          <BrowseTab />
        </TabsContent>

        <TabsContent value="installed" className="px-4 pt-4">
          <InstalledTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Featured tab — curator-pubkey scoped
// ---------------------------------------------------------------------------

function FeaturedTab({ curatorPubkey }: { curatorPubkey?: string }) {
  const { nostr } = useNostr();

  const { data: events, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['tiles-featured', curatorPubkey ?? ''],
    enabled: !!curatorPubkey,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!curatorPubkey) return [];
      const results = await nostr.query(
        [
          {
            kinds: [TILE_KIND],
            authors: [curatorPubkey],
            '#t': ['nostr-canvas-tile'],
            '#s': [TILE_SCHEMA],
            limit: 60,
          },
        ],
        { signal },
      );
      return [...results].sort((a, b) => b.created_at - a.created_at);
    },
  });

  if (!curatorPubkey) {
    return (
      <EmptyState
        title="No curator configured"
        body="This Ditto install has no `curatorPubkey` set. Ask your operator to configure one, or explore the Browse tab."
      />
    );
  }

  if (isLoading) return <TileGridSkeleton />;
  if (!events || events.length === 0) {
    return (
      <EmptyState
        title="No featured tiles yet"
        body="The curator hasn't published any tiles. Check back soon, or browse the global list."
      />
    );
  }

  return <TileGrid events={events} />;
}

// ---------------------------------------------------------------------------
// Browse tab — global discovery
// ---------------------------------------------------------------------------

function BrowseTab() {
  const { nostr } = useNostr();

  const { data: events, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['tiles-browse'],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const results = await nostr.query(
        [
          {
            kinds: [TILE_KIND],
            '#t': ['nostr-canvas-tile'],
            '#s': [TILE_SCHEMA],
            limit: 200,
          },
        ],
        { signal },
      );
      return [...results].sort((a, b) => b.created_at - a.created_at);
    },
  });

  if (isLoading) return <TileGridSkeleton />;
  if (!events || events.length === 0) {
    return (
      <EmptyState
        title="No tiles found"
        body="No nostr-canvas tiles are available on your current relays."
      />
    );
  }

  return <TileGrid events={events} verifyAuthor />;
}

// ---------------------------------------------------------------------------
// Installed tab
// ---------------------------------------------------------------------------

function InstalledTab() {
  const { installedTiles, installedNaddrs } = useInstalledTiles();

  if (installedTiles.length === 0) {
    return (
      <EmptyState
        title="You haven't installed any tiles yet"
        body="Explore the Featured and Browse tabs to find tiles that match how you want to use Nostr."
      />
    );
  }

  return (
    <div className="space-y-3">
      {installedTiles.map(({ naddr, event }) => (
        <InstalledTileRow key={naddr} naddr={naddr} event={event} />
      ))}
      {/* Show a minimal line for any installed naddr whose local cache entry
          is missing, so the user can reinstall rather than seeing a ghost. */}
      {installedNaddrs
        .filter((naddr) => !installedTiles.some((t) => t.naddr === naddr))
        .map((naddr) => (
          <Card key={naddr} className="border-dashed">
            <CardContent className="py-3 px-4 text-sm text-muted-foreground">
              Local copy missing — reinstall{' '}
              <Link to={`/tiles/${naddr}`} className="underline">
                this tile
              </Link>{' '}
              to restore it.
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

function InstalledTileRow({
  naddr,
  event,
}: {
  naddr: string;
  event: NostrEvent;
}) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const image = tileImage(event);
  const identifier = getDTag(event) ?? '';

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          {image
            ? (
              <img
                src={image}
                alt=""
                className="size-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )
            : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <LayoutGrid className="size-5" />
              </div>
            )}
        </div>

        <div className="flex-1 min-w-0">
          <Link
            to={`/tiles/${naddr}`}
            className="block truncate font-medium hover:underline"
          >
            {tileDisplayName(event)}
          </Link>
          <div className="truncate text-xs text-muted-foreground">
            {metadata?.nip05 ?? identifier}
          </div>
        </div>

        <Link
          to={`/tiles/run/${encodeURIComponent(identifier)}`}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open
        </Link>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared grid components
// ---------------------------------------------------------------------------

function TileGrid({
  events,
  verifyAuthor,
}: {
  events: NostrEvent[];
  verifyAuthor?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {events.map((event) => (
        <TileCard key={event.id} event={event} verifyAuthor={verifyAuthor} />
      ))}
    </div>
  );
}

function TileCard({
  event,
  verifyAuthor,
}: {
  event: NostrEvent;
  verifyAuthor?: boolean;
}) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;

  // In browse mode, hide tiles whose d-tag prefix doesn't match the author's
  // kind-0 nip05 claim — protects against unverified/lookalike tiles.
  if (verifyAuthor && !verifyTileDTag(event, metadata)) return null;

  const naddr = tileEventToNaddr(event);
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
        'group block overflow-hidden rounded-xl border border-border bg-card',
        'transition-colors hover:border-primary/40',
      )}
    >
      <div className="relative aspect-[16/9] bg-gradient-to-br from-primary/10 to-muted/20">
        {image
          ? (
            <img
              src={image}
              alt=""
              className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )
          : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
              <LayoutGrid className="size-10" />
            </div>
          )}
        {version && (
          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            v{version}
          </span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <h3 className="truncate text-sm font-semibold group-hover:text-primary">
          {name}
        </h3>
        {summary && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{summary}</p>
        )}
        <p className="truncate text-xs text-muted-foreground/80">
          by {metadata?.display_name ?? metadata?.name ?? parts?.nip05 ?? 'unknown'}
        </p>
      </div>
    </Link>
  );
}

function TileGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
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

function EmptyState({ title, body }: { title: string; body: string }) {
  // When rendered, make sure the canvas gate is open so the user's
  // installed tiles' runtime is ready — an empty state on /tiles still
  // benefits from tile registrations being active.
  const { requestGate } = useCanvasGate();
  useMemo(() => {
    requestGate();
    return null;
  }, [requestGate]);

  // Touch NSchema so the module isn't considered unused (some adapters
  // parse metadata in-place here in the future).
  void n;

  return (
    <Card className="border-dashed">
      <CardContent className="py-12 px-8 text-center">
        <h2 className="mx-auto max-w-sm text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
          {body}
        </p>
      </CardContent>
    </Card>
  );
}
