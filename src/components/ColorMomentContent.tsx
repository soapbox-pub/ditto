import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

type Layout = 'horizontal' | 'vertical' | 'grid' | 'star' | 'checkerboard' | 'diagonalStripes';

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function getColors(tags: string[][]): string[] {
  return tags
    .filter(([n]) => n === 'c')
    .map(([, v]) => v)
    .filter((v) => /^#[0-9A-Fa-f]{6}$/.test(v));
}

/** Compute a best-fit grid: cols × rows for n items. */
function gridDimensions(n: number): { cols: number; rows: number } {
  if (n <= 3) return { cols: n, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n === 5) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 2 };
}

/** Relative luminance of a hex color (0-1). */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// ─── Layout renderers ──────────────────────────────────────

function HorizontalLayout({ colors }: { colors: string[] }) {
  return (
    <div className="flex flex-col w-full rounded-2xl overflow-hidden" style={{ height: 180 }}>
      {colors.map((color, i) => (
        <div key={i} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

function VerticalLayout({ colors }: { colors: string[] }) {
  return (
    <div className="flex w-full rounded-2xl overflow-hidden" style={{ height: 180 }}>
      {colors.map((color, i) => (
        <div key={i} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

function GridLayout({ colors }: { colors: string[] }) {
  const { cols } = gridDimensions(colors.length);
  return (
    <div
      className="grid w-full rounded-2xl overflow-hidden"
      style={{
        height: 180,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
    >
      {colors.map((color, i) => (
        <div key={i} style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

/** Build a clip-path polygon for a pie slice with slight overlap to prevent gaps. */
function pieSliceClipPath(index: number, total: number): string {
  const angle = 360 / total;
  const overlap = 0.5;
  const startAngle = index * angle - 90 - overlap;
  const sweepAngle = angle + overlap * 2;
  const scale = 1.5; // extend past edges so slices cover the full rect
  const steps = 12;

  const points: string[] = ['50% 50%'];
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (sweepAngle * i) / steps;
    const rad = (a * Math.PI) / 180;
    const x = 50 + 50 * scale * Math.cos(rad);
    const y = 50 + 50 * scale * Math.sin(rad);
    points.push(`${x}% ${y}%`);
  }
  return `polygon(${points.join(', ')})`;
}

function StarLayout({ colors }: { colors: string[] }) {
  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ height: 180 }}>
      {/* Background fill to cover the center seam where all slices meet */}
      <div className="absolute inset-0" style={{ backgroundColor: colors[0] }} />
      {colors.map((color, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            backgroundColor: color,
            clipPath: pieSliceClipPath(i, colors.length),
          }}
        />
      ))}
    </div>
  );
}

function CheckerboardLayout({ colors }: { colors: string[] }) {
  const n = colors.length;
  const height = 180;
  // Target ~6 rows so squares are large and legible
  const rows = n * Math.max(2, 4 - n);
  const cellSize = height / rows;
  // Enough columns to cover any container width (overflow is clipped)
  const cols = Math.ceil(600 / cellSize);

  const cells: { color: string; key: string }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const colorIndex = (row + col) % n;
      cells.push({ color: colors[colorIndex], key: `${row}-${col}` });
    }
  }

  return (
    <div
      className="w-full rounded-2xl overflow-hidden"
      style={{ height }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
        }}
      >
        {cells.map(({ color, key }) => (
          <div key={key} style={{ backgroundColor: color }} />
        ))}
      </div>
    </div>
  );
}

function DiagonalStripesLayout({ colors }: { colors: string[] }) {
  const n = colors.length;
  const pct = 100 / n;
  const stops = colors.map((color, i) => {
    const start = pct * i;
    const end = pct * (i + 1);
    return `${color} ${start}% ${end}%`;
  }).join(', ');

  return (
    <div
      className="w-full rounded-2xl"
      style={{
        height: 180,
        background: `linear-gradient(135deg, ${stops})`,
      }}
    />
  );
}

// ─── Main component ──────────────────────────────────────

const LAYOUT_MAP: Record<Layout, React.FC<{ colors: string[] }>> = {
  horizontal: HorizontalLayout,
  vertical: VerticalLayout,
  grid: GridLayout,
  star: StarLayout,
  checkerboard: CheckerboardLayout,
  diagonalStripes: DiagonalStripesLayout,
};

export function ColorMomentContent({ event }: { event: NostrEvent }) {
  const colors = useMemo(() => getColors(event.tags), [event.tags]);
  const layout = (getTag(event.tags, 'layout') ?? 'horizontal') as Layout;
  const name = getTag(event.tags, 'name');
  const emoji = event.content.trim() || undefined;

  const LayoutComponent = LAYOUT_MAP[layout] ?? HorizontalLayout;

  // Determine whether overlay text should be light or dark
  const avgLum = useMemo(() => {
    if (colors.length === 0) return 0.5;
    return colors.reduce((sum, c) => sum + luminance(c), 0) / colors.length;
  }, [colors]);
  const overlayTextClass = avgLum > 0.5 ? 'text-black/80' : 'text-white/90';

  if (colors.length === 0) return null;

  return (
    <div className="mt-2">
      {/* Name above the palette */}
      {name && (
        <p className="text-[15px] font-medium mb-2">{name}</p>
      )}

      {/* Color palette with emoji overlay */}
      <div className="relative isolate">
        <LayoutComponent colors={colors} />

        {/* Emoji centered over the palette */}
        {emoji && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={cn(
                'text-4xl drop-shadow-lg select-none',
                overlayTextClass,
              )}
            >
              {emoji}
            </span>
          </div>
        )}
      </div>

      {/* Color hex swatches underneath */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {colors.map((color, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(color);
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono text-muted-foreground hover:bg-secondary/60 transition-colors"
            title={`Copy ${color}`}
          >
            <span
              className="size-2.5 rounded-sm shrink-0 border border-border/40"
              style={{ backgroundColor: color }}
            />
            {color}
          </button>
        ))}
      </div>
    </div>
  );
}
