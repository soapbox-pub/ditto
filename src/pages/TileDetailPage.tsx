import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { LayoutGrid, ChevronDown } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireCanvas } from '@/components/CanvasRuntimeProvider';
import { TileInstallDialog } from '@/components/TileInstallDialog';
import { parseTileDefinition } from '@/tiles/definition';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCanvasTileInstallations } from '@/components/CanvasTileInstallationsProvider';
import { canUseCanvasTiles } from '@/lib/canvasPlatform';
import { useAppContext } from '@/hooks/useAppContext';
import { useSeoMeta } from '@/hooks/useSeoMeta';

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
  const { config } = useAppContext();
  const installations = useCanvasTileInstallations();
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
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
  const tile = eventQuery.data?.flatMap((event) => { const def = parseTileDefinition(event); return def ? [def] : []; })[0];
  const tileEvent = eventQuery.data?.find((event) => parseTileDefinition(event)?.identifier === tile?.identifier);
  const installed = tile ? installations.getCachedDefinition({ pubkey: tile.pubkey, identifier: tile.identifier }) : undefined;
  const updateAvailable = !!installed && !!tile && installed.id !== tile.id;

  useSeoMeta({
    title: tile ? `${tile.name} | Widgets | ${config.appName}` : `Widgets | ${config.appName}`,
    description: tile?.summary ?? 'View and install a Nostr Canvas widget.',
  });

  const openInstall = () => setInstallDialogOpen(true);

  return (
    <main className="mx-auto w-full max-w-3xl">
      <PageHeader title="Widget" icon={<LayoutGrid className="size-5" />} backTo="/widgets" />
      <div className="space-y-5 px-4 pb-8">
        {eventQuery.isLoading ? <Skeleton className="h-72 rounded-xl" /> : !tile ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">This widget is unavailable or invalid.</CardContent></Card>
        ) : (
          <>
            <Card><CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
                  {tile.image ? <img src={tile.image} alt="" className="size-full object-cover" /> : <LayoutGrid className="size-8" />}
                </div>
                <div className="min-w-0"><h2 className="text-2xl font-bold">{tile.name}</h2><p className="mt-1 text-sm text-muted-foreground">{tile.identifier} · v{tile.version}</p>{tile.summary && <p className="mt-3">{tile.summary}</p>}</div>
              </div>
              <div className="flex flex-wrap gap-2">{tile.perms.map((permission) => <Badge key={permission} variant="outline">{permission}</Badge>)}{tile.widget && <Badge variant="secondary">Widget: {tile.widget.label}</Badge>}</div>
              <div className="flex flex-wrap justify-end gap-2">
                {!user && <p className="self-center text-sm text-muted-foreground">Log in to install widgets.</p>}
                {installed ? <Button variant="outline" onClick={() => installations.uninstall({ pubkey: tile.pubkey, identifier: tile.identifier })}>Remove widget</Button> : <Button onClick={openInstall} disabled={!user && canUseCanvasTiles()}>Install widget</Button>}
                {updateAvailable && <Button onClick={openInstall}>Update widget</Button>}
              </div>
            </CardContent></Card>
            {tile.description && <Card><CardContent className="prose prose-sm max-w-none p-5 dark:prose-invert"><Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{tile.description}</Markdown></CardContent></Card>}
            <Card><CardContent className="p-3">
              <Collapsible className="rounded-lg border">
                <CollapsibleTrigger className="group flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium text-left">
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90 motion-reduce:transition-none" />
                  Source code
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="max-h-[32rem] overflow-auto px-3 pb-3 text-xs leading-relaxed"><code>{tile.script}</code></pre>
                </CollapsibleContent>
              </Collapsible>
            </CardContent></Card>
          </>
        )}
      </div>
      <TileInstallDialog tile={tile} tileEvent={tileEvent} open={installDialogOpen} onOpenChange={setInstallDialogOpen} />
    </main>
  );
}
