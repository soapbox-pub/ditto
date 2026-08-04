import { describe, expect, it } from 'vitest';
import { getWidgetDefinition } from '@/lib/sidebarWidgets';
import { canvasWidgetDefinition, canvasWidgetId, canvasWidgetIdentifier } from '@/tiles/sidebarWidgets';
import type { TileDefinition } from '@/tiles/definition';

const widgetTile: TileDefinition = {
  id: 'tile-event',
  pubkey: 'a'.repeat(64),
  createdAt: 1,
  identifier: 'weather@example.com:forecast',
  name: 'Forecast',
  version: '1.0.0',
  language: 'lua',
  script: 'return ui.text("Forecast")',
  perms: [],
  summary: 'Local conditions and forecast.',
  widget: { label: 'Weather' },
};

describe('Canvas sidebar widgets', () => {
  it('creates a namespaced picker definition only for installed widget tiles', () => {
    expect(canvasWidgetDefinition(widgetTile)).toMatchObject({
      id: 'canvas:weather@example.com:forecast',
      label: 'Weather',
      description: 'Local conditions and forecast.',
      category: 'discovery',
    });
    expect(canvasWidgetId(widgetTile.identifier)).toBe('canvas:weather@example.com:forecast');
    expect(canvasWidgetIdentifier('canvas:weather@example.com:forecast')).toBe(widgetTile.identifier);
  });

  it('rejects non-Canvas IDs and tiles without a widget declaration', () => {
    expect(canvasWidgetIdentifier('trends')).toBeUndefined();
    expect(canvasWidgetDefinition({ ...widgetTile, widget: undefined })).toBeUndefined();
  });

  it('does not alter the static native widget registry', () => {
    expect(getWidgetDefinition('canvas:weather@example.com:forecast')).toBeUndefined();
    expect(getWidgetDefinition('trends')?.label).toBe('Trending');
  });
});
