import { useNostrCanvas, useTile } from '@soapbox.pub/nostr-canvas/react';
import { TileOutputView } from '@/components/TileOutputView';
import { Skeleton } from '@/components/ui/skeleton';
import { canUseCanvasTiles } from '@/lib/canvasPlatform';

/** Mounts one Canvas tile instance for the sidebar and tears it down on unmount. */
export function CanvasTileWidget({ identifier }: { identifier: string }) {
  if (!canUseCanvasTiles()) {
    return <p className="px-1 py-3 text-xs text-muted-foreground">Tiles on mobile apps are coming soon.</p>;
  }

  return <CanvasTileExecution identifier={identifier} />;
}

function CanvasTileExecution({ identifier }: { identifier: string }) {
  const { runtime } = useNostrCanvas();
  const { tileId, output } = useTile(identifier, { placement: 'widget' });

  if (!output) {
    return (
      <div className="space-y-2 p-1" aria-live="polite">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <p className="text-xs text-muted-foreground">Loading tile...</p>
      </div>
    );
  }

  return (
    <TileOutputView
      output={output}
      tileId={tileId ?? undefined}
      onInput={(handler, payload) => {
        if (tileId && runtime) runtime.deliverInputEvent(tileId, handler, payload);
      }}
    />
  );
}
