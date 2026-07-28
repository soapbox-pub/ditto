import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { LayoutGrid } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { Capability } from '@soapbox.pub/nostr-canvas';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireCanvas } from '@/components/CanvasRuntimeProvider';
import { parseTileDefinition } from '@/tiles/definition';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCanvasTileInstallations } from '@/components/CanvasTileInstallationsProvider';
import { canUseCanvasTiles } from '@/lib/canvasPlatform';

export function TileDetailPage() {
  return (
    <RequireCanvas>
      <TileDetailInner />
    </RequireCanvas>
  );
}

function TileDetailInner() {
  const { naddr } = useParams<{ naddr: string }>();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const installations = useCanvasTileInstallations();
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [mobileAvailabilityOpen, setMobileAvailabilityOpen] = useState(false);
  const [approvedPermissions, setApprovedPermissions] = useState<Capability[]>([]);
  const address = useMemo(() => {
    try {
      const decoded = nip19.decode(naddr ?? '');
      return decoded.type === 'naddr' && decoded.data.kind === 30207 ? decoded.data : undefined;
    } catch {
      return undefined;
    }
  }, [naddr]);
  const eventQuery = useQuery({
    queryKey: ['nostr-canvas', 'tile', address?.pubkey, address?.identifier],
    enabled: !!address,
    queryFn: ({ signal }) => nostr.query([{ kinds: [30207], authors: [address!.pubkey], '#d': [address!.identifier], limit: 1 }], { signal }),
  });
  const tile = eventQuery.data?.map(parseTileDefinition).find(Boolean);
  const tileEvent = eventQuery.data?.find((event) => parseTileDefinition(event)?.identifier === tile?.identifier);
  const installed = tile ? installations.getCachedDefinition({ pubkey: tile.pubkey, identifier: tile.identifier }) : undefined;
  const updateAvailable = !!installed && !!tile && installed.id !== tile.id;

  const install = () => {
    if (!canUseCanvasTiles()) {
      setPermissionsOpen(false);
      setMobileAvailabilityOpen(true);
      return;
    }
    if (!tileEvent || !tile) return;
    installations.install(tileEvent, approvedPermissions.filter((permission) => tile.perms.includes(permission)));
    setPermissionsOpen(false);
  };
  const openInstall = () => {
    if (canUseCanvasTiles()) setPermissionsOpen(true);
    else setMobileAvailabilityOpen(true);
  };

  return (
    <main className="mx-auto w-full max-w-3xl">
      <PageHeader title={tile?.name ?? 'Tile'} icon={<LayoutGrid className="size-5" />} backTo="/tiles" />
      <div className="space-y-5 px-4 pb-8">
        {eventQuery.isLoading ? <Skeleton className="h-72 rounded-xl" /> : !tile ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">This tile is unavailable or invalid.</CardContent></Card>
        ) : (
          <>
            <Card><CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
                  {tile.image ? <img src={tile.image} alt="" className="size-full object-cover" /> : <LayoutGrid className="size-8" />}
                </div>
                <div className="min-w-0"><h1 className="text-2xl font-bold">{tile.name}</h1><p className="mt-1 text-sm text-muted-foreground">{tile.identifier} · v{tile.version}</p>{tile.summary && <p className="mt-3">{tile.summary}</p>}</div>
              </div>
              <div className="flex flex-wrap gap-2">{tile.perms.map((permission) => <Badge key={permission} variant="outline">{permission}</Badge>)}{tile.widget && <Badge variant="secondary">Widget: {tile.widget.label}</Badge>}</div>
              <div className="flex flex-wrap gap-2">
                {installed ? <Button variant="outline" onClick={() => installations.uninstall({ pubkey: tile.pubkey, identifier: tile.identifier })}>Remove tile</Button> : <Button onClick={openInstall} disabled={!user && canUseCanvasTiles()}>Install tile</Button>}
                {updateAvailable && <Button onClick={openInstall}>Update tile</Button>}
                {!user && <p className="self-center text-sm text-muted-foreground">Log in to install tiles.</p>}
              </div>
            </CardContent></Card>
            {tile.description && <Card><CardContent className="prose prose-sm max-w-none p-5 dark:prose-invert"><Markdown rehypePlugins={[rehypeSanitize]}>{tile.description}</Markdown></CardContent></Card>}
            <Card><CardContent className="p-0"><pre className="max-h-[32rem] overflow-auto p-5 text-xs leading-relaxed"><code>{tile.script}</code></pre></CardContent></Card>
          </>
        )}
      </div>
      <Dialog open={permissionsOpen} onOpenChange={setPermissionsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Install {tile?.name}</DialogTitle><DialogDescription>Review the capabilities requested by {tile?.identifier}. {tile?.pubkey}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            {tile?.perms.length ? tile.perms.map((permission) => {
              const id = `tile-permission-${permission}`;
              return <label key={permission} htmlFor={id} className="flex items-center gap-3 text-sm"><Checkbox id={id} checked={approvedPermissions.includes(permission)} onCheckedChange={(checked) => setApprovedPermissions((current) => checked ? [...current, permission] : current.filter((item) => item !== permission))} />{permission}</label>;
            }) : <p className="text-sm text-muted-foreground">This tile does not request any capabilities.</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPermissionsOpen(false)}>Cancel</Button><Button onClick={install}>Install</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={mobileAvailabilityOpen} onOpenChange={setMobileAvailabilityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tiles are coming soon</DialogTitle>
            <DialogDescription>Installing and running tiles is not available in the Ditto mobile apps yet. You can browse tiles here and install them from a web browser.</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={() => setMobileAvailabilityOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
