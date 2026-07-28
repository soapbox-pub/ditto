import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { BadgeCheck, Check, CircleArrowUp, LayoutGrid, RefreshCw, Search, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TileInstallDialog } from '@/components/TileInstallDialog';
import { MarketplaceNag } from '@/components/MarketplaceNag';
import { useCanvasTileInstallations } from '@/components/CanvasTileInstallationsProvider';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { useAppContext } from '@/hooks/useAppContext';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { canUseCanvasTiles } from '@/lib/canvasPlatform';
import { getBackgroundThemeMode } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';
import { widgetAccentVars } from '@/lib/widgetAccent';
import { canvasWidgetId } from '@/tiles/sidebarWidgets';
import { getTileNip05, getNewestTileDefinitions, searchMarketplaceTiles, sortMarketplaceTiles, type MarketplaceSortOrder } from '@/tiles/marketplace';
import { countTileViews, parseTileDefinition, type TileDefinition } from '@/tiles/definition';
import { sortCapabilities } from '@/tiles/capabilities';
import { nip19 } from 'nostr-tools';

function TileMarketplaceCard({ tile, showUnverified, onInstall, expanded, onToggle }: { tile: TileDefinition; showUnverified: boolean; onInstall: (tile: TileDefinition) => void; expanded: boolean; onToggle: () => void }) {
  const nip05 = getTileNip05(tile.identifier);
  const verified = useNip05Verify(nip05, tile.pubkey);
  const installations = useCanvasTileInstallations();
  const { user } = useCurrentUser();

  // Accent tint matching the same tile's sidebar frame
  const { config: appConfig } = useAppContext();
  void appConfig.theme;
  const mode = getBackgroundThemeMode();
  const widgetId = canvasWidgetId(tile.identifier);
  const accentVars = widgetAccentVars(widgetId, mode);

  const isVerified = verified.data;
  const multiView = countTileViews(tile) > 1;
  const sortedPerms = sortCapabilities(tile.perms);
  const shownPerms = sortedPerms.slice(0, 2);
  const extraPerms = sortedPerms.slice(2);

  const installed = installations.getCachedDefinition({ pubkey: tile.pubkey, identifier: tile.identifier });
  const updateAvailable = !!installed && installed.id !== tile.id;

  const tileId = `${tile.pubkey}:${tile.identifier}`;

  if (verified.isLoading) return <Skeleton className="h-36 rounded-xl" />;
  if (!isVerified && !showUnverified) return null;

  const naddr = nip19.naddrEncode({ kind: 30207, pubkey: tile.pubkey, identifier: tile.identifier });
  return (
    <div
      data-tile-card={tileId}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      onClick={onToggle}
      className={cn(
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl motion-safe:transition-transform h-full',
        expanded && 'relative z-10 motion-safe:scale-105',
      )}
    >
      <Card
        className={cn(
          'border-2 border-[hsl(var(--widget-accent)/0.65)] rounded-xl overflow-hidden h-full transition-colors',
          expanded
            ? 'bg-[hsl(var(--widget-accent-surface)/0.9)]'
            : 'bg-[hsl(var(--widget-accent)/0.06)] hover:bg-[hsl(var(--widget-accent)/0.1)]',
        )}
        style={accentVars as React.CSSProperties}
      >
        <CardContent className={cn('flex h-full gap-3 p-4', expanded && 'text-[hsl(var(--widget-accent-surface-foreground))]')}>
          <div className={cn(
            'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl',
            expanded ? 'bg-[hsl(var(--widget-accent-surface-foreground)/0.15)] text-[hsl(var(--widget-accent-surface-foreground))]' : 'bg-primary/10 text-primary',
          )}>
            {tile.image ? <img src={tile.image} alt="" className="size-full object-cover" /> : <LayoutGrid className="size-7" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="truncate font-semibold">{tile.name}</h2>
                {isVerified && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={-1}>
                        <BadgeCheck
                          className={cn('size-4 shrink-0', expanded ? 'opacity-70' : 'text-[hsl(var(--widget-accent))]')}
                          aria-label="Verified — publisher matches the widget's NIP-05"
                        />
                        <span className="sr-only">Verified — publisher matches the widget's NIP-05</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Verified — publisher matches the widget's NIP-05
                    </TooltipContent>
                  </Tooltip>
                )}
                {multiView && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={-1}>
                        <Sparkles
                          className={cn('size-4 shrink-0', expanded ? 'opacity-50' : 'text-muted-foreground')}
                          aria-label="Supports more views in other apps"
                        />
                        <span className="sr-only">Supports more views in other apps</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Supports more views in other apps
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <span className={cn('shrink-0 text-xs', expanded ? 'opacity-70' : 'text-muted-foreground')}>v{tile.version}</span>
            </div>
            {tile.summary && <p className={cn('mt-1 line-clamp-2 text-sm', expanded ? 'opacity-80' : 'text-muted-foreground')}>{tile.summary}</p>}
            <div className={cn('mt-auto flex items-center gap-1 overflow-hidden whitespace-nowrap pt-3 text-[11px] leading-4', expanded ? 'text-[hsl(var(--widget-accent-surface-foreground)/0.75)]' : 'text-muted-foreground')}>
              {tile.perms.length > 0 ? (
                <>
                  <span className="truncate">{shownPerms.join(' · ')}</span>
                  {extraPerms.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="shrink-0 cursor-default underline decoration-dotted underline-offset-2" tabIndex={0}>
                          +{extraPerms.length}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="space-y-0.5">
                        {extraPerms.map((perm) => (
                          <p key={perm}>{perm}</p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
              ) : (
                <span className={cn(expanded && 'text-[hsl(var(--widget-accent-surface-foreground)/0.6)]')}>No special permissions</span>
              )}
            </div>
            {expanded ? (
              <div className="mt-2 flex h-9 items-center justify-end gap-2">
                {!installed && (
                  <Button size="sm" variant="ghost" className={cn(mode === 'dark' ? 'bg-white text-black hover:bg-white/85' : 'bg-black text-white hover:bg-black/85')} disabled={!user && canUseCanvasTiles()} onClick={(e) => { e.stopPropagation(); onInstall(tile); }}>
                    Install
                  </Button>
                )}
                {updateAvailable && (
                  <Button size="sm" variant="ghost" className={cn(mode === 'dark' ? 'bg-white text-black hover:bg-white/85' : 'bg-black text-white hover:bg-black/85')} onClick={(e) => { e.stopPropagation(); onInstall(tile); }}>
                    Update
                  </Button>
                )}
                <Button size="sm" variant="ghost" className={cn(mode === 'dark' ? 'bg-white text-black hover:bg-white/85' : 'bg-black text-white hover:bg-black/85')} asChild onClick={(e) => e.stopPropagation()}>
                  <Link to={`/widgets/${naddr}`}>View</Link>
                </Button>
              </div>
            ) : (
              <div className="mt-2 flex h-9 items-center justify-end gap-2">
                {installed && (
                  updateAvailable ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CircleArrowUp className="size-3.5" />
                      Update available
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Check className="size-3.5" />
                      Installed
                    </span>
                  )
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function TilesPage() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const [query, setQuery] = useState('');
  const [showUnverified, setShowUnverified] = useState(false);
  const [installTarget, setInstallTarget] = useState<{ tile: TileDefinition; event: NostrEvent } | undefined>();
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<MarketplaceSortOrder>('newest');
  const deferredQuery = useDeferredValue(query);
  const tilesQuery = useQuery({
    queryKey: ['nostr-canvas', 'marketplace', 3],
    queryFn: ({ signal }) => nostr.query([{ kinds: [30207], '#t': ['nostr-canvas-tile'], '#s': ['3'], limit: 250 }], { signal }),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
  });
  const tiles = useMemo(() => {
    const searched = searchMarketplaceTiles(getNewestTileDefinitions(tilesQuery.data ?? []), deferredQuery);
    return sortMarketplaceTiles(searched, sortOrder);
  }, [deferredQuery, tilesQuery.data, sortOrder]);

  const eventMap = useMemo(() => {
    const map = new Map<string, NostrEvent>();
    for (const event of tilesQuery.data ?? []) {
      const def = parseTileDefinition(event);
      if (def) map.set(def.id, event);
    }
    return map;
  }, [tilesQuery.data]);

  const handleInstall = useCallback((tile: TileDefinition) => {
    const event = eventMap.get(tile.id);
    if (event) setInstallTarget({ tile, event });
  }, [eventMap]);

  // Collapse on Escape
  useEffect(() => {
    if (!expandedId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedId(undefined);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [expandedId]);

  // Collapse when clicking outside the grid cards
  useEffect(() => {
    if (!expandedId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-tile-card]')) setExpandedId(undefined);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [expandedId]);

  useSeoMeta({
    title: `Widgets | ${config.appName}`,
    description: 'Browse and install Nostr Canvas widgets for your feed and sidebar.',
  });

  return (
    <main className="mx-auto w-full max-w-5xl">
      <PageHeader title="Widgets" icon={<LayoutGrid className="size-5" />} backTo="/" />
      <div className="space-y-6 px-4 pb-8">
        <p className="max-w-2xl text-sm text-muted-foreground">Discover Nostr Canvas widgets. Review each widget's requested capabilities before installing it.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[200px]">
            <span className="sr-only">Search widgets</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search widgets" className="pl-9" />
          </label>
          <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as MarketplaceSortOrder)}>
            <SelectTrigger className="w-[160px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="recently-updated">Recently updated</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="show-unverified-tiles">Show unverified widgets</Label>
            <p className="text-xs text-muted-foreground">Unverified widgets are not associated with the NIP-05 identity in their identifier.</p>
          </div>
          <Switch id="show-unverified-tiles" checked={showUnverified} onCheckedChange={setShowUnverified} />
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => void tilesQuery.refetch()} disabled={tilesQuery.isFetching}>
            <RefreshCw className="size-4" />
            {tilesQuery.isFetching ? 'Checking relays' : 'Refresh widgets'}
          </Button>
        </div>
        {tilesQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-36 rounded-xl" /><Skeleton className="h-36 rounded-xl" /></div>
        ) : tilesQuery.isError ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">Widgets could not be loaded from your relays.</CardContent></Card>
        ) : tiles.length === 0 ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No matching widgets found.</CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">{tiles.map((tile) => {
          const tileId = `${tile.pubkey}:${tile.identifier}`;
          const isExpanded = expandedId === tileId;
          return (
            <TileMarketplaceCard
              key={tileId}
              tile={tile}
              showUnverified={showUnverified}
              onInstall={handleInstall}
              expanded={isExpanded}
              onToggle={() => setExpandedId(isExpanded ? undefined : tileId)}
            />
          );
        })}</div>
        )}
      </div>
      <TileInstallDialog tile={installTarget?.tile} tileEvent={installTarget?.event} open={!!installTarget} onOpenChange={(open) => { if (!open) setInstallTarget(undefined); }} />
      <MarketplaceNag />
    </main>
  );
}
