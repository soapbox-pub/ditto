import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { BadgeCheck, LayoutGrid, RefreshCw, Search, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { useAppContext } from '@/hooks/useAppContext';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { getBackgroundThemeMode } from '@/lib/colorUtils';
import { widgetAccentVars } from '@/lib/widgetAccent';
import { canvasWidgetId } from '@/tiles/sidebarWidgets';
import { getTileNip05, getNewestTileDefinitions, searchMarketplaceTiles } from '@/tiles/marketplace';
import { countTileViews, type TileDefinition } from '@/tiles/definition';
import { sortCapabilities } from '@/tiles/capabilities';
import { nip19 } from 'nostr-tools';

function TileMarketplaceCard({ tile, showUnverified }: { tile: TileDefinition; showUnverified: boolean }) {
  const nip05 = getTileNip05(tile.identifier);
  const verified = useNip05Verify(nip05, tile.pubkey);

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

  if (verified.isLoading) return <Skeleton className="h-36 rounded-xl" />;
  if (!isVerified && !showUnverified) return null;

  const naddr = nip19.naddrEncode({ kind: 30207, pubkey: tile.pubkey, identifier: tile.identifier });
  return (
    <Link to={`/widgets/${naddr}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      <Card
        className="border-2 border-[hsl(var(--widget-accent)/0.65)] bg-[hsl(var(--widget-accent)/0.06)] rounded-xl overflow-hidden h-full transition-colors hover:bg-[hsl(var(--widget-accent)/0.1)]"
        style={accentVars as React.CSSProperties}
      >
        <CardContent className="flex gap-3 p-4">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
            {tile.image ? <img src={tile.image} alt="" className="size-full object-cover" /> : <LayoutGrid className="size-7" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="truncate font-semibold">{tile.name}</h2>
                {isVerified && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={-1}>
                        <BadgeCheck
                          className="size-4 shrink-0 text-[hsl(var(--widget-accent))]"
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
                          className="size-4 shrink-0 text-muted-foreground"
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
              <span className="shrink-0 text-xs text-muted-foreground">v{tile.version}</span>
            </div>
            {tile.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tile.summary}</p>}
            {tile.perms.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 overflow-hidden">
                {shownPerms.map((perm) => (
                  <Badge key={perm} variant="outline" className="shrink-0 text-xs">
                    {perm}
                  </Badge>
                ))}
                {extraPerms.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="shrink-0 text-xs cursor-default" tabIndex={0}>
                        +{extraPerms.length}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="space-y-0.5">
                      {extraPerms.map((perm) => (
                        <p key={perm}>{perm}</p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function TilesPage() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const [query, setQuery] = useState('');
  const [showUnverified, setShowUnverified] = useState(false);
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
  const tiles = useMemo(
    () => searchMarketplaceTiles(getNewestTileDefinitions(tilesQuery.data ?? []), deferredQuery),
    [deferredQuery, tilesQuery.data],
  );

  useSeoMeta({
    title: `Widgets | ${config.appName}`,
    description: 'Browse and install Nostr Canvas widgets for your feed and sidebar.',
  });

  return (
    <main className="mx-auto w-full max-w-5xl">
      <PageHeader title="Widgets" icon={<LayoutGrid className="size-5" />} backTo="/" />
      <div className="space-y-6 px-4 pb-8">
        <p className="max-w-2xl text-sm text-muted-foreground">Discover Nostr Canvas widgets. Review each widget's requested capabilities before installing it.</p>
        <label className="relative block">
          <span className="sr-only">Search widgets</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search widgets" className="pl-9" />
        </label>
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
          <div className="grid gap-3 sm:grid-cols-2">{tiles.map((tile) => <TileMarketplaceCard key={`${tile.pubkey}:${tile.identifier}`} tile={tile} showUnverified={showUnverified} />)}</div>
        )}
      </div>
    </main>
  );
}
