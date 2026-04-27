/**
 * Renders an installed nostr-canvas tile in the right-sidebar widget slot.
 *
 * Driven by a `WidgetConfig` with `id === 'tile'` and a `tileIdentifier`.
 * The widget header inside `WidgetCard` shows the tile's `name` from its
 * cached kind-30207 event; this component is just the content.
 */

import { memo } from 'react';
import { LayoutGrid } from 'lucide-react';

import { TileView } from '@/components/nostr-canvas/TileView';

interface TileWidgetProps {
  tileIdentifier?: string;
}

export const TileWidget = memo(function TileWidget({
  tileIdentifier,
}: TileWidgetProps) {
  if (!tileIdentifier) {
    return (
      <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
        <LayoutGrid className="size-3.5" />
        No tile selected.
      </div>
    );
  }

  return (
    <TileView identifier={tileIdentifier} placement="widget" />
  );
});
