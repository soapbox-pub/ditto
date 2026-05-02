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

const WALL_STYLE_LABELS: Record<WallStyle, string> = {
  solid: 'Solid',
  stripes: 'Stripes',
  dots: 'Dots',
  gradient: 'Gradient',
};

const FLOOR_STYLE_LABELS: Record<FloorStyle, string> = {
  solid: 'Solid',
  wood: 'Wood',
  tile: 'Tile',
  carpet: 'Carpet',
};

const VARIANT_LABELS: Record<SurfaceVariant, string> = {
  soft: 'Soft',
  medium: 'Medium',
  bold: 'Bold',
  wide: 'Wide',
  narrow: 'Narrow',
};

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
  const styles = type === 'wall' ? WALL_STYLES : FLOOR_STYLES;
  const labels = type === 'wall' ? WALL_STYLE_LABELS : FLOOR_STYLE_LABELS;
  const variants = getStyleVariants(value.style);

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
    <div className="space-y-3">
      {/* Pattern style selector */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Pattern</label>
        <div className="flex flex-wrap gap-1.5">
          {styles.map(style => (
            <button
              key={style}
              type="button"
              onClick={() => handleStyleChange(style as WallStyle | FloorStyle)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                'hover:bg-accent/60 active:scale-95',
                value.style === style
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'bg-muted/50 text-muted-foreground',
              )}
            >
              {(labels as Record<string, string>)[style] ?? style}
            </button>
          ))}
        </div>
      </div>

      {/* Color pickers */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Colors</label>
        <div className="flex items-center gap-3">
          <ColorInput
            label="Base"
            value={value.palette[0] ?? '#ffffff'}
            onChange={handleColor1Change}
          />
          {value.style !== 'solid' && (
            <ColorInput
              label="Accent"
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
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Detail</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {variants.map((v, i) => (
              <span key={v} className="contents">
                {/* Visual separator between size group and intensity group */}
                {i > 0 && variants[i - 1] === 'wide' && (v === 'soft' || v === 'bold') && (
                  <span className="w-px h-4 bg-border/60 mx-0.5" />
                )}
                <button
                  type="button"
                  onClick={() => handleVariantChange(v)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-medium transition-all',
                    'hover:bg-accent/60 active:scale-95',
                    value.variant === v
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                      : 'bg-muted/50 text-muted-foreground',
                  )}
                >
                  {VARIANT_LABELS[v]}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Angle selector (conditional) */}
      {supportsAngle(value.style) && (
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            <span className="inline-flex items-center gap-1">
              <RotateCw className="size-3" />
              Angle
            </span>
          </label>
          <div className="flex items-center gap-1.5">
            {(value.style === 'tile' ? TILE_ANGLE_PRESETS : ANGLE_PRESETS).map(a => (
              <button
                key={a}
                type="button"
                onClick={() => handleAngleChange(a)}
                className={cn(
                  'size-7 rounded text-[10px] font-medium transition-all flex items-center justify-center',
                  'hover:bg-accent/60 active:scale-95',
                  (value.angle ?? 0) === a
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'bg-muted/50 text-muted-foreground',
                )}
              >
                {a}°
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Color Input ──────────────────────────────────────────────────────────────

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-7 rounded border border-border/50 cursor-pointer p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0"
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </label>
  );
}

// ─── Pattern Swatch ───────────────────────────────────────────────────────────

function PatternSwatch({ surface }: { surface: RoomSurfaceLayout }) {
  const background = getSurfaceBackground(surface, 0.6);

  return (
    <div
      className="size-10 rounded-lg border border-border/40 shadow-sm"
      style={{ background }}
      aria-hidden
    />
  );
}
