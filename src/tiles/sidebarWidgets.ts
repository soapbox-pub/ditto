import { Puzzle } from 'lucide-react';
import type { WidgetDefinition } from '@/lib/sidebarWidgets';
import type { TileDefinition } from '@/tiles/definition';

export const CANVAS_WIDGET_PREFIX = 'canvas:';

export function canvasWidgetId(identifier: string): string {
  return `${CANVAS_WIDGET_PREFIX}${identifier}`;
}

export function canvasWidgetIdentifier(id: string): string | undefined {
  const identifier = id.startsWith(CANVAS_WIDGET_PREFIX) ? id.slice(CANVAS_WIDGET_PREFIX.length) : undefined;
  return identifier || undefined;
}

/** Builds a sidebar definition for an installed tile that opted into widget placement. */
export function canvasWidgetDefinition(tile: TileDefinition): WidgetDefinition | undefined {
  if (!tile.widget) return undefined;

  return {
    id: canvasWidgetId(tile.identifier),
    label: tile.widget.label,
    description: tile.summary ?? 'Canvas tile widget',
    icon: Puzzle,
    defaultHeight: 320,
    minHeight: 160,
    maxHeight: 700,
    category: 'discovery',
  };
}
