import { useMemo, useState, useEffect, useId } from 'react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { hexToHslString, hexToRgb, rgbToHsl, hslToRgb, getLuminance, getContrastRatio, parseHsl, formatHsl, hexLuminance } from '@/lib/colorUtils';
import type { CoreThemeColors } from '@/themes';
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
  const H = 180;
  // Use a canvas wider than the visible area by H so that parallelogram stripes
  // at a 45° diagonal fill the rectangle exactly. The viewBox is (W+H) × H but
  // we clip it back to W × H via the wrapper div + overflow-hidden.
  // Each stripe is a true parallelogram with vertical width W/n and a horizontal
  // shift of H from top to bottom, giving a consistent 45° diagonal boundary.
  const W = 400;
  const totalW = W + H; // canvas wide enough so last stripe reaches bottom-right
  const stripeW = totalW / n;

  return (
    <div className="w-full rounded-2xl overflow-hidden" style={{ height: H }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        shapeRendering="geometricPrecision"
      >
        {colors.map((color, i) => {
          // Stripe i: parallelogram where the top edge is at x=[i*sw, (i+1)*sw]
          // and the bottom edge shifts left by H (height), giving a 45° angle.
          const tx0 = i * stripeW;             // top-left x
          const tx1 = (i + 1) * stripeW;     // top-right x
          const bx0 = i * stripeW - H;       // bottom-left x (shifted left by H)
          const bx1 = (i + 1) * stripeW - H; // bottom-right x
          const points = [
            `${tx0},0`,
            `${tx1},0`,
            `${bx1},${H}`,
            `${bx0},${H}`,
          ].join(' ');
          return <polygon key={i} points={points} fill={color} />;
        })}
      </svg>
    </div>
  );
}

// ─── Palette → theme mapping ─────────────────────────────

function hexContrast(hex1: string, hex2: string): number {
  return getContrastRatio(hexToRgb(hex1), hexToRgb(hex2));
}

function hexSaturation(hex: string): number {
  return rgbToHsl(...hexToRgb(hex)).s;
}

/**
 * Adjust the lightness of an HSL string until it achieves at least `targetRatio`
 * contrast against `bgHsl`. Steps toward white or black depending on which
 * direction gives better contrast. Returns the adjusted HSL string.
 */
function enforceContrast(hsl: string, bgHsl: string, targetRatio: number): string {
  const bg = parseHsl(bgHsl);
  const bgLum = getLuminance(...hslToRgb(bg.h, bg.s, bg.l));
  const { h, s, l } = parseHsl(hsl);

  // Decide direction: go lighter if bg is dark, darker if bg is light
  const goLighter = bgLum < 0.18;
  let current = l;

  for (let i = 0; i < 50; i++) {
    current = goLighter
      ? Math.min(100, current + 2)
      : Math.max(0, current - 2);
    const rgb = hslToRgb(h, s, current);
    const lum = getLuminance(...rgb);
    const lighter = Math.max(bgLum, lum);
    const darker = Math.min(bgLum, lum);
    if ((lighter + 0.05) / (darker + 0.05) >= targetRatio) break;
  }

  return formatHsl(h, s, current);
}

/**
 * Map palette hex colors to CoreThemeColors with guaranteed readability:
 * 1. background = darkest color
 * 2. text       = lightest color; if contrast < 4.5:1, synthesize white or black
 * 3. primary    = most saturated remaining color; if contrast < 3:1 against
 *                 background, adjust its lightness until it passes
 */
function paletteToTheme(colors: string[]): CoreThemeColors {
  if (colors.length === 0) {
    return { background: '0 0% 10%', text: '0 0% 98%', primary: '258 70% 55%' };
  }

  const sorted = [...colors].sort((a, b) => hexLuminance(a) - hexLuminance(b));
  const bgHex = sorted[0];
  const bgHsl = hexToHslString(bgHex);

  // Text: lightest palette color; override with white/black if contrast is too low
  const textHex = sorted[sorted.length - 1];
  let textHsl = hexToHslString(textHex);
  if (hexContrast(textHex, bgHex) < 4.5) {
    // Pick white or black — whichever contrasts better
    const whiteContrast = hexContrast('#ffffff', bgHex);
    const blackContrast = hexContrast('#000000', bgHex);
    textHsl = whiteContrast >= blackContrast ? '0 0% 98%' : '222 20% 8%';
  }

  // Primary: most saturated of remaining colors; nudge lightness if needed
  const rest = colors.filter((c) => c !== bgHex && c !== textHex);
  const pool = rest.length > 0 ? rest : [textHex];
  const primaryHex = pool.reduce((best, c) => hexSaturation(c) > hexSaturation(best) ? c : best, pool[0]);
  let primaryHsl = hexToHslString(primaryHex);
  if (hexContrast(primaryHex, bgHex) < 3) {
    primaryHsl = enforceContrast(primaryHsl, bgHsl, 3);
  }

  return { background: bgHsl, text: textHsl, primary: primaryHsl };
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

/** Standalone blinking eye button for setting a color moment as the active theme. */
export function ColorMomentEyeButton({ event }: { event: NostrEvent }) {
  const colors = useMemo(() => getColors(event.tags), [event.tags]);
  const { applyCustomTheme } = useTheme();
  const [isBlinking, setIsBlinking] = useState(false);
  const uid = useId();

  useEffect(() => {
    if (isBlinking) {
      const timer = setTimeout(() => setIsBlinking(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isBlinking]);

  const handleSetTheme = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsBlinking(true);
    applyCustomTheme(paletteToTheme(colors));
  };

  if (colors.length === 0) return null;

  const outer = colors[0] ?? '#888';
  const iris = colors[colors.length - 1] ?? '#888';

  // Build the eye as a data-URI SVG so the browser renders it as an image
  // (smooth anti-aliasing, no compositing layer on siblings)
  const eyeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="45" fill="${outer}"/>
    <circle cx="50" cy="50" r="32" fill="white" opacity="0.9"/>
    <circle cx="50" cy="50" r="20" fill="${iris}"/>
    <circle cx="50" cy="50" r="10" fill="#1c1917"/>
    <circle cx="43" cy="43" r="4" fill="white" opacity="0.8"/>
  </svg>`;
  const eyeUrl = `data:image/svg+xml,${encodeURIComponent(eyeSvg)}`;

  return (
    <button
      onClick={handleSetTheme}
      className="flex items-center gap-1.5 hover:opacity-80 active:scale-95 transition-all shrink-0"
      title="Set as theme"
    >
      <span className="text-[11px] font-medium text-muted-foreground">Set as theme</span>
      {/* Eye container — overflow-hidden clips the eyelid, doesn't touch siblings */}
      <div className="relative size-9 rounded-full overflow-hidden" id={uid}>
        <img src={eyeUrl} alt="" className="w-9 h-9" />
        {isBlinking && (
          <div className="absolute inset-0 animate-eyelid-blink">
            <div className="absolute rounded-full bg-background w-full h-full bottom-0 left-0" />
          </div>
        )}
      </div>
    </button>
  );
}

export function ColorMomentContent({ event }: { event: NostrEvent }) {
  const colors = useMemo(() => getColors(event.tags), [event.tags]);
  const layout = (getTag(event.tags, 'layout') ?? 'horizontal') as Layout;
  const name = getTag(event.tags, 'name');
  const rawContent = event.content.trim();
  // Only treat content as an emoji if it's a single grapheme cluster (emoji or short symbol).
  // Long text should not be overlaid on the palette.
  const isSingleEmoji = rawContent.length > 0 && [...rawContent].length <= 2 && /\p{Emoji}/u.test(rawContent);
  const emoji = isSingleEmoji ? rawContent : undefined;

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

      {/* Color hex swatches */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
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
