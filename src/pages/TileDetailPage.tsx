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
import { getBackgroundThemeMode } from '@/lib/colorUtils';
import { widgetAccentVars } from '@/lib/widgetAccent';
import { canvasWidgetId } from '@/tiles/sidebarWidgets';

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
  void config.theme;
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

  // Widget accent — same pattern as the marketplace cards.
  const mode = getBackgroundThemeMode();
  const accentVars = tile ? widgetAccentVars(canvasWidgetId(tile.identifier), mode) : undefined;

  useSeoMeta({
    title: tile ? `${tile.name} | Widgets | ${config.appName}` : `Widgets | ${config.appName}`,
    description: tile?.summary ?? 'View and install a Nostr Canvas widget.',
  });

  const openInstall = () => setInstallDialogOpen(true);

  return (
    <main className="mx-auto w-full max-w-3xl">
      <PageHeader title="Widget" icon={<LayoutGrid className="size-5" />} backTo="/widgets" />
      <div className="space-y-5 px-4 pb-8">
        {eventQuery.isLoading ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : !tile ? (
          <div className="rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
            This widget is unavailable or invalid.
          </div>
        ) : (
          <div
            className="rounded-xl border-2 border-[hsl(var(--widget-accent)/0.65)] bg-[hsl(var(--widget-accent)/0.06)] overflow-hidden"
            style={accentVars as React.CSSProperties}
          >
            {/* ── Header ── */}
            <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
                  {tile.image ? <img src={tile.image} alt="" className="size-full object-cover" /> : <LayoutGrid className="size-8" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold">{tile.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{tile.identifier} · v{tile.version}</p>
                  {tile.summary && <p className="mt-3">{tile.summary}</p>}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {!user && <p className="self-center text-sm text-muted-foreground">Log in to install widgets.</p>}
                {installed ? (
                  <Button variant="outline" onClick={() => installations.uninstall({ pubkey: tile.pubkey, identifier: tile.identifier })}>Remove widget</Button>
                ) : (
                  <Button onClick={openInstall} disabled={!user && canUseCanvasTiles()}>Install widget</Button>
                )}
                {updateAvailable && <Button onClick={openInstall}>Update widget</Button>}
              </div>
            </div>

            {/* ── Description ── */}
            {tile.description && (
              <>
                <div className="border-t border-[hsl(var(--widget-accent)/0.25)]" />
                <div className="p-5 sm:p-6">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</h3>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{tile.description}</Markdown>
                  </div>
                </div>
              </>
            )}

            {/* ── Permissions ── */}
            <div className="border-t border-[hsl(var(--widget-accent)/0.25)]" />
            <div className="p-5 sm:p-6">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Permissions</h3>
              <div className="flex flex-wrap gap-2">
                {tile.perms.length > 0 ? (
                  tile.perms.map((permission) => <Badge key={permission} variant="outline">{permission}</Badge>)
                ) : (
                  <span className="text-sm text-muted-foreground">No special permissions</span>
                )}
                {tile.widget && <Badge variant="secondary">Widget: {tile.widget.label}</Badge>}
              </div>
            </div>

            {/* ── Source code ── */}
            <div className="border-t border-[hsl(var(--widget-accent)/0.25)]" />
            <div className="p-5 sm:p-6">
              <Collapsible>
                <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-sm font-medium">
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90 motion-reduce:transition-none" />
                  Source code
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-3 max-h-[32rem] overflow-auto text-xs leading-relaxed"><code>{tile.script}</code></pre>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        )}
      </div>
      <TileInstallDialog tile={tile} tileEvent={tileEvent} open={installDialogOpen} onOpenChange={setInstallDialogOpen} />
    </main>
  );
}
