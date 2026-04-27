/**
 * `/tiles/run/:identifier` — run an installed tile at `placement="main"`.
 *
 * This is the landing page when a tile's nav item is activated, or when
 * the user clicks "Open" on an installed tile. The tile renders into the
 * full content column; it can request any capability it's been granted.
 *
 * `ctx.navigate({ identifier, props })` from another tile lands here via
 * React Router `location.state.tileProps`.
 */

import { useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { TileView } from '@/components/nostr-canvas/TileView';
import { useAppContext } from '@/hooks/useAppContext';
import { useInstalledTiles } from '@/hooks/useInstalledTiles';
import { useCanvasGate } from '@/lib/nostr-canvas/canvasGate';
import { getDTag } from '@/lib/nostr-canvas/identifiers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

export function TileRunPage() {
  const { identifier: raw = '' } = useParams<{ identifier: string }>();
  const identifier = useMemo(() => decodeURIComponent(raw), [raw]);
  const { config } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();
  const { gateOpen, requestGate } = useCanvasGate();
  const { installedTiles } = useInstalledTiles();

  // Navigate() from other tiles may have attached props via state.
  const stateProps = useMemo(() => {
    const s = location.state as { tileProps?: Record<string, unknown> } | null;
    return s?.tileProps ?? {};
  }, [location.state]);

  // Find the installed tile whose `d`-tag matches the identifier, so we
  // can show name/image in the page header.
  const tileEntry = useMemo(
    () =>
      installedTiles.find(
        (entry) => getDTag(entry.event) === identifier,
      ) ?? null,
    [installedTiles, identifier],
  );

  const title = tileEntry?.event.tags.find(([n]) => n === 'name')?.[1] ?? identifier;
  const image = sanitizeUrl(
    tileEntry?.event.tags.find(([n]) => n === 'image')?.[1],
  );

  useSeoMeta({
    title: `${title} | Tiles | ${config.appName}`,
  });

  // Force the gate open — this page can't work without the runtime.
  if (!gateOpen) {
    requestGate();
  }

  if (!tileEntry) {
    return (
      <main className="pb-16 sidebar:pb-0">
        <div className="flex items-center gap-2 px-4 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/tiles')}
            className="-ml-2"
          >
            <ArrowLeft className="size-4" />
            Back to tiles
          </Button>
        </div>
        <Card className="mx-4 mt-6 border-dashed">
          <CardContent className="py-12 px-8 text-center">
            <h1 className="text-base font-semibold">Tile not installed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Install <code>{identifier}</code> from the Tiles page to open it.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="pb-16 sidebar:pb-0">
      <PageHeader
        title={title}
        icon={
          image ? (
            <img
              src={image}
              alt=""
              className="size-5 rounded object-cover"
            />
          ) : undefined
        }
        backTo="/tiles"
      />
      <div className="px-4 pt-4">
        <TileView
          identifier={identifier}
          placement="main"
          props={stateProps}
        />
      </div>
    </main>
  );
}
