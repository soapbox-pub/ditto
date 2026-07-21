import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { LayoutGrid, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { getTileNip05, getNewestTileDefinitions, searchMarketplaceTiles } from '@/tiles/marketplace';
import type { TileDefinition } from '@/tiles/definition';
import { nip19 } from 'nostr-tools';

function TileMarketplaceCard({ tile, showUnverified }: { tile: TileDefinition; showUnverified: boolean }) {
  const nip05 = getTileNip05(tile.identifier);
  const verified = useNip05Verify(nip05, tile.pubkey);

  if (verified.isLoading) return <Skeleton className="h-36 rounded-xl" />;
  if (!verified.data && !showUnverified) return null;

  const naddr = nip19.naddrEncode({ kind: 30207, pubkey: tile.pubkey, identifier: tile.identifier });
  return (
    <Link to={`/tiles/${naddr}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      <Card className="h-full overflow-hidden transition-colors hover:bg-secondary/40">
        <CardContent className="flex gap-3 p-4">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
            {tile.image ? <img src={tile.image} alt="" className="size-full object-cover" /> : <LayoutGrid className="size-7" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="truncate font-semibold">{tile.name}</h2>
              <span className="shrink-0 text-xs text-muted-foreground">v{tile.version}</span>
            </div>
            {tile.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tile.summary}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant={verified.data ? 'secondary' : 'destructive'}>{verified.data ? 'Verified author' : 'Unverified author'}</Badge>
              {tile.widget && <Badge variant="outline">Widget</Badge>}
              {tile.perms.map((permission) => <Badge key={permission} variant="outline">{permission}</Badge>)}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function TilesPage() {
  const { nostr } = useNostr();
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

  return (
    <main className="mx-auto w-full max-w-5xl">
      <PageHeader title="Tiles" icon={<LayoutGrid className="size-5" />} backTo="/" />
      <div className="space-y-6 px-4 pb-8">
        <p className="max-w-2xl text-sm text-muted-foreground">Discover Nostr Canvas tiles. Review each tile's requested capabilities before installing it.</p>
        <label className="relative block">
          <span className="sr-only">Search tiles</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tiles" className="pl-9" />
        </label>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="show-unverified-tiles">Show unverified tiles</Label>
            <p className="text-xs text-muted-foreground">Unverified tiles are not associated with the NIP-05 identity in their identifier.</p>
          </div>
          <Switch id="show-unverified-tiles" checked={showUnverified} onCheckedChange={setShowUnverified} />
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => void tilesQuery.refetch()} disabled={tilesQuery.isFetching}>
            <RefreshCw className="size-4" />
            {tilesQuery.isFetching ? 'Checking relays' : 'Refresh tiles'}
          </Button>
        </div>
        {tilesQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-36 rounded-xl" /><Skeleton className="h-36 rounded-xl" /></div>
        ) : tilesQuery.isError ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">Tiles could not be loaded from your relays.</CardContent></Card>
        ) : tiles.length === 0 ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No matching tiles found.</CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">{tiles.map((tile) => <TileMarketplaceCard key={`${tile.pubkey}:${tile.identifier}`} tile={tile} showUnverified={showUnverified} />)}</div>
        )}
      </div>
    </main>
  );
}
