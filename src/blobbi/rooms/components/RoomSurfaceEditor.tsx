/**
 * RoomSurfaceEditor — Reusable editor panel for one surface (wall or floor).
 *
 * Separated concerns:
 * 1. Pattern/style selection (structure only)
 * 2. Color selection (two color pickers for the palette)
 * 3. Variant/scale selection (when applicable, filtered per style)
 * 4. Angle/rotation (for directional patterns, including dots)
 *
 * All outputs are validated RoomSurfaceLayout values.
 * No raw CSS strings, no arbitrary class names.
 */

import { useCallback } from 'react';
import { RotateCw } from 'lucide-react';
import { defineMessages, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { ColorPicker } from '@/components/ui/color-picker';
import { cn } from '@/lib/utils';

import type { RoomSurfaceLayout, WallStyle, FloorStyle, SurfaceVariant } from '../lib/room-layout-schema';
import { WALL_STYLES, FLOOR_STYLES } from '../lib/room-layout-schema';
import { getSurfaceBackground } from '../lib/room-surface-background';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoomSurfaceEditorProps {
  type: 'wall' | 'floor';
  value: RoomSurfaceLayout;
  onChange: (value: RoomSurfaceLayout) => void;
}

// ─── Style labels and descriptions ───────────────────────────────────────────

const WALL_STYLE_LABELS: Record<WallStyle, MessageDescriptor> = defineMessages({
  solid: { id: 'blobbiRoom.surface.style.solid', defaultMessage: 'Solid' },
  stripes: { id: 'blobbiRoom.surface.style.stripes', defaultMessage: 'Stripes' },
  dots: { id: 'blobbiRoom.surface.style.dots', defaultMessage: 'Dots' },
  gradient: { id: 'blobbiRoom.surface.style.gradient', defaultMessage: 'Gradient' },
});

const FLOOR_STYLE_LABELS: Record<FloorStyle, MessageDescriptor> = defineMessages({
  solid: { id: 'blobbiRoom.surface.style.solid', defaultMessage: 'Solid' },
  wood: { id: 'blobbiRoom.surface.style.wood', defaultMessage: 'Wood' },
  tile: { id: 'blobbiRoom.surface.style.tile', defaultMessage: 'Tile' },
  carpet: { id: 'blobbiRoom.surface.style.carpet', defaultMessage: 'Carpet' },
});

const VARIANT_LABELS: Record<SurfaceVariant, MessageDescriptor> = defineMessages({
  soft: { id: 'blobbiRoom.surface.variant.soft', defaultMessage: 'Soft' },
  medium: { id: 'blobbiRoom.surface.variant.medium', defaultMessage: 'Medium' },
  bold: { id: 'blobbiRoom.surface.variant.bold', defaultMessage: 'Bold' },
  wide: { id: 'blobbiRoom.surface.variant.wide', defaultMessage: 'Wide' },
  narrow: { id: 'blobbiRoom.surface.variant.narrow', defaultMessage: 'Narrow' },
});

/** Angle presets for quick selection */
const ANGLE_PRESETS = [0, 45, 90, 135, 180] as const;

/** Tile only has two meaningful orientations: square (0°) and diamond (45°) */
const TILE_ANGLE_PRESETS = [0, 45] as const;

/** Which styles support angle rotation */
function supportsAngle(style: string): boolean {
  return ['stripes', 'gradient', 'dots', 'wood', 'tile', 'carpet'].includes(style);
}

/** Which styles support variant, and which variant options are meaningful */
function getStyleVariants(style: string): SurfaceVariant[] | null {
  switch (style) {
    case 'stripes': return ['narrow', 'medium', 'wide', 'soft', 'bold'];
    case 'wood': return ['narrow', 'medium', 'wide', 'soft', 'bold'];
    case 'carpet': return ['soft', 'medium', 'bold'];
    default: return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoomSurfaceEditor({ type, value, onChange }: RoomSurfaceEditorProps) {
  const intl = useIntl();
  const styles = type === 'wall' ? WALL_STYLES : FLOOR_STYLES;
  const labels = type === 'wall' ? WALL_STYLE_LABELS : FLOOR_STYLE_LABELS;
  const variants = getStyleVariants(value.style);
  const styleLabel = (style: string) => {
    const label = (labels as Record<string, MessageDescriptor | undefined>)[style];
    return label ? intl.formatMessage(label) : style;
  };

  const handleStyleChange = useCallback((style: WallStyle | FloorStyle) => {
    const newVariants = getStyleVariants(style);
    onChange({ ...value, style, variant: newVariants ? (value.variant && newVariants.includes(value.variant) ? value.variant : 'medium') : undefined });
  }, [value, onChange]);

  const handleColor1Change = useCallback((color: string) => {
    const palette = [...value.palette];
    palette[0] = color;
    onChange({ ...value, palette });
  }, [value, onChange]);

  const handleColor2Change = useCallback((color: string) => {
    const palette = [...value.palette];
    palette[1] = color;
    onChange({ ...value, palette });
  }, [value, onChange]);

  const handleVariantChange = useCallback((variant: SurfaceVariant) => {
    onChange({ ...value, variant });
  }, [value, onChange]);

  const handleAngleChange = useCallback((angle: number) => {
    onChange({ ...value, angle: ((angle % 360) + 360) % 360 });
  }, [value, onChange]);

  return (
    <div className="space-y-4">
      {/* Pattern style selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          <FormattedMessage id="blobbiRoom.surface.pattern" defaultMessage="Pattern" />
        </label>
        <div className="flex flex-wrap gap-2">
          {styles.map(style => (
            <button
              key={style}
              type="button"
              onClick={() => handleStyleChange(style as WallStyle | FloorStyle)}
              aria-pressed={value.style === style}
              className={cn(
                'h-9 px-4 rounded-full text-sm font-medium transition-colors',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                value.style === style
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              {styleLabel(style)}
            </button>
          ))}
        </div>
      </div>

      {/* Color pickers */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          <FormattedMessage id="blobbiRoom.surface.colors" defaultMessage="Colors" />
        </label>
        <div className="flex items-center gap-4">
          <ColorPicker
            label={intl.formatMessage({ id: 'blobbiRoom.surface.base', defaultMessage: 'Base' })}
            value={value.palette[0] ?? '#ffffff'}
            onChange={handleColor1Change}
          />
          {value.style !== 'solid' && (
            <ColorPicker
              label={intl.formatMessage({ id: 'blobbiRoom.surface.accent', defaultMessage: 'Accent' })}
              value={value.palette[1] ?? value.palette[0] ?? '#000000'}
              onChange={handleColor2Change}
            />
          )}
          {/* Live swatch preview */}
          <div className="ml-auto">
            <PatternSwatch surface={value} />
          </div>
        </div>
      </div>

      {/* Variant selector (conditional, filtered per style) */}
      {variants && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">
            <FormattedMessage id="blobbiRoom.surface.detail" defaultMessage="Detail" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {variants.map((v, i) => (
              <span key={v} className="contents">
                {/* Visual separator between size group and intensity group */}
                {i > 0 && variants[i - 1] === 'wide' && (v === 'soft' || v === 'bold') && (
                  <span className="w-px h-6 bg-border/60 mx-1" />
                )}
                <button
                  type="button"
                  onClick={() => handleVariantChange(v)}
                  aria-pressed={value.variant === v}
                  className={cn(
                    'h-9 px-4 rounded-full text-sm font-medium transition-colors',
                    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                    value.variant === v
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                  )}
                >
                  {intl.formatMessage(VARIANT_LABELS[v])}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Angle selector (conditional) */}
      {supportsAngle(value.style) && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">
            <span className="inline-flex items-center gap-1">
              <RotateCw className="size-3.5" />
              <FormattedMessage id="blobbiRoom.surface.angle" defaultMessage="Angle" />
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {(value.style === 'tile' ? TILE_ANGLE_PRESETS : ANGLE_PRESETS).map(a => (
              <button
                key={a}
                type="button"
                onClick={() => handleAngleChange(a)}
                aria-pressed={(value.angle ?? 0) === a}
                className={cn(
                  'h-9 min-w-12 px-3 rounded-full text-sm font-medium tabular-nums transition-colors flex items-center justify-center',
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                  (value.angle ?? 0) === a
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                )}
              >
                <FormattedMessage id="blobbiRoom.surface.degrees" defaultMessage="{angle}°" values={{ angle: a }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pattern Swatch ───────────────────────────────────────────────────────────

function PatternSwatch({ surface }: { surface: RoomSurfaceLayout }) {
  const background = getSurfaceBackground(surface, 0.6);

  return (
    <div
      className="size-12 rounded-2xl border border-border/40 shadow-xs"
      style={{ background }}
      aria-hidden
    />
  );
}
