/**
 * ColorPaletteDisplay
 *
 * Renders a color palette (array of hex strings) in one of 6 layouts,
 * matching the approach used in mew and espy for kind 3367 color moments.
 */

import { hexLuminance } from '@/lib/colorUtils';

export type PaletteLayout =
  | 'horizontal'
  | 'vertical'
  | 'grid'
  | 'star'
  | 'checkerboard'
  | 'diagonalStripes';

interface ColorPaletteDisplayProps {
  colors: string[];
  layout?: PaletteLayout;
  /** className applied to the outer wrapper — controls size/shape */
  className?: string;
  /** Overlay content (emoji, buttons, etc.) */
  children?: React.ReactNode;
}

function gridDimensions(n: number): { cols: number; rows: number } {
  if (n <= 3) return { cols: n, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  return { cols: 3, rows: 2 };
}

function pieSliceClipPath(index: number, total: number): string {
  const STEPS = 12;
  const OVERLAP = 0.5;
  const startAngle = (index / total) * 360 - 90 - OVERLAP;
  const endAngle = ((index + 1) / total) * 360 - 90 + OVERLAP;

  const points: string[] = ['50% 50%'];
  for (let s = 0; s <= STEPS; s++) {
    const angle = ((startAngle + (s / STEPS) * (endAngle - startAngle)) * Math.PI) / 180;
    const x = 50 + 150 * Math.cos(angle);
    const y = 50 + 150 * Math.sin(angle);
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${points.join(', ')})`;
}

function HorizontalLayout({ colors }: { colors: string[] }) {
  return (
    <div className="flex flex-col w-full h-full">
      {colors.map((color, i) => (
        <div key={i} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

function VerticalLayout({ colors }: { colors: string[] }) {
  return (
    <div className="flex w-full h-full">
      {colors.map((color, i) => (
        <div key={i} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

function GridLayout({ colors }: { colors: string[] }) {
  const { cols, rows } = gridDimensions(colors.length);
  return (
    <div
      className="w-full h-full"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {colors.map((color, i) => (
        <div key={i} style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

function StarLayout({ colors }: { colors: string[] }) {
  const n = colors.length;
  return (
    <div className="relative w-full h-full" style={{ backgroundColor: colors[0] }}>
      {colors.map((color, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            backgroundColor: color,
            clipPath: pieSliceClipPath(i, n),
          }}
        />
      ))}
    </div>
  );
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function safeHex(color: string): string {
  return HEX_RE.test(color) ? color : '#000000';
}

function CheckerboardLayout({ colors }: { colors: string[] }) {
  const n = colors.length;
  const rows = n * Math.max(2, 4 - n);
  const cellSize = 20;
  const cols = rows;
  const svgSize = cellSize * cols;
  const rects: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = safeHex(colors[(r + c) % n]);
      rects.push(
        `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}"/>`
      );
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${svgSize}' height='${svgSize}'>${rects.join('')}</svg>`;
  const dataUri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  return (
    <div
      className="w-full h-full"
      style={{
        backgroundImage: dataUri,
        backgroundSize: `${(100 / cols) * cellSize}% ${(100 / rows) * cellSize}%`,
        backgroundRepeat: 'repeat',
        imageRendering: 'pixelated',
      }}
    />
  );
}

function DiagonalStripesLayout({ colors }: { colors: string[] }) {
  const n = colors.length;
  const W = 400;
  const H = 200;
  const stripeW = (W + H) / n;

  const polygons = colors.map((rawColor, i) => {
    const color = safeHex(rawColor);
    const x0 = i * stripeW;
    const x1 = (i + 1) * stripeW;
    const points = [
      `${x0},0`,
      `${x1},0`,
      `${x1 - H},${H}`,
      `${x0 - H},${H}`,
    ].join(' ');
    return `<polygon points="${points}" fill="${color}"/>`;
  });

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none' shape-rendering='geometricPrecision'>${polygons.join('')}</svg>`;

  return (
    <div
      className="w-full h-full"
      style={{
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}

export function ColorPaletteDisplay({
  colors,
  layout = 'horizontal',
  className = '',
  children,
}: ColorPaletteDisplayProps) {
  if (colors.length === 0) return null;

  const avgLum = colors.reduce((s, c) => s + hexLuminance(c), 0) / colors.length;
  const emojiColorClass = avgLum > 0.5 ? 'text-black/80' : 'text-white/90';

  return (
    <div className={`overflow-hidden ${className}`}>
      {layout === 'horizontal'      && <HorizontalLayout      colors={colors} />}
      {layout === 'vertical'        && <VerticalLayout        colors={colors} />}
      {layout === 'grid'            && <GridLayout            colors={colors} />}
      {layout === 'star'            && <StarLayout            colors={colors} />}
      {layout === 'checkerboard'    && <CheckerboardLayout    colors={colors} />}
      {layout === 'diagonalStripes' && <DiagonalStripesLayout colors={colors} />}

      {children && (
        <div className={`absolute inset-0 flex items-center justify-center pointer-events-none select-none ${emojiColorClass}`}>
          {children}
        </div>
      )}
    </div>
  );
}
