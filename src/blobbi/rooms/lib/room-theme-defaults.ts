/**
 * Room Theme Defaults — generate room layouts derived from the user's active theme.
 *
 * Reads CSS custom properties (HSL-based) from the document root and produces
 * room colors that match the app's visual identity. Each room gets a distinct
 * visual identity while still feeling cohesive with the theme.
 *
 * Design rationale per room:
 * - Home: warm gradient wall, wide wood floor — cozy living room
 * - Kitchen: clean solid wall, tile floor with subtle grout — bright kitchen
 * - Care: cool-tinted wall, diamond tile floor — bathroom feel
 * - Rest: soft gradient wall, carpet floor — calm sleep room
 * - Closet: neutral wall, medium wood floor — storage/wardrobe
 *
 * Saved rooms preserve exact user-selected colors and are never affected.
 */

import type { BlobbiRoomId } from './room-config';
import type { RoomLayout } from './room-layout-schema';
import { DEFAULT_ROOM_LAYOUTS } from './room-layout-defaults';

// ─── HSL Helpers ──────────────────────────────────────────────────────────────

/** Parse a CSS HSL variable value like "220 14% 96%" into [h, s, l] */
function parseHsl(raw: string): [number, number, number] | null {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null;
  return [h, s, l];
}

/** Convert HSL values to hex */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Mix two HSL colors (linear interpolation) */
function mixHsl(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): string {
  return hslToHex(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  );
}

/** Adjust lightness of an HSL color (clamped 0–100) */
function adjustLightness(c: [number, number, number], delta: number): [number, number, number] {
  return [c[0], c[1], Math.max(0, Math.min(100, c[2] + delta))];
}

// ─── Theme Reader ─────────────────────────────────────────────────────────────

interface ThemeColors {
  background: [number, number, number];
  foreground: [number, number, number];
  primary: [number, number, number];
  primaryForeground: [number, number, number];
  accent: [number, number, number] | null;
}

function readThemeColors(): ThemeColors | null {
  if (typeof document === 'undefined') return null;
  const style = getComputedStyle(document.documentElement);
  const background = parseHsl(style.getPropertyValue('--background'));
  const foreground = parseHsl(style.getPropertyValue('--foreground'));
  const primary = parseHsl(style.getPropertyValue('--primary'));
  const primaryForeground = parseHsl(style.getPropertyValue('--primary-foreground'));
  if (!background || !foreground || !primary || !primaryForeground) return null;
  // Accent is optional — fall back to a mix of primary + background
  const accent = parseHsl(style.getPropertyValue('--accent'));
  return { background, foreground, primary, primaryForeground, accent };
}

// ─── Default Generator ────────────────────────────────────────────────────────

/**
 * Generate theme-aware room defaults based on the active CSS theme.
 * Returns static fallback if theme colors cannot be read.
 */
export function getThemeRoomDefaults(): Record<BlobbiRoomId, RoomLayout> {
  const theme = readThemeColors();
  if (!theme) return DEFAULT_ROOM_LAYOUTS;

  const { background: bg, foreground: fg, primary: pr } = theme;
  const ac = theme.accent ?? [
    bg[0] + (pr[0] - bg[0]) * 0.5,
    bg[1] + (pr[1] - bg[1]) * 0.5,
    bg[2] + (pr[2] - bg[2]) * 0.5,
  ] as [number, number, number];

  // ── Shared base colors ──
  const wallBase = hslToHex(bg[0], bg[1], bg[2]);

  // ── Home: warm gradient wall, wide oak wood floor ──
  const homeWallWarm = mixHsl(bg, pr, 0.08);
  const homeWoodBase = mixHsl(pr, fg, 0.3);
  const homeWoodAccent = mixHsl(pr, fg, 0.45);

  // ── Kitchen: clean solid wall, bright tile floor ──
  const kitchenWallAccent = mixHsl(bg, fg, 0.06);
  const kitchenTileBase = mixHsl(bg, fg, 0.03);
  const kitchenTileGrout = mixHsl(bg, fg, 0.10);

  // ── Care: cool-shifted wall, diamond tile floor ──
  const careWallBase = mixHsl(bg, pr, 0.05);
  const careWallAccent = mixHsl(bg, pr, 0.10);
  const careTileBase = mixHsl(bg, ac, 0.06);
  const careTileGrout = mixHsl(bg, pr, 0.12);

  // ── Rest: soft gradient wall, gentle carpet floor ──
  const restWallEnd = mixHsl(bg, pr, 0.15);
  const restCarpetBase = mixHsl(pr, bg, 0.55);
  const restCarpetAccent = mixHsl(pr, bg, 0.65);

  // ── Closet: neutral wall, medium wood floor ──
  const closetWallAccent = mixHsl(bg, fg, 0.08);
  const closetWoodBase = hslToHex(...adjustLightness(pr, -8));
  const closetWoodAccent = hslToHex(...adjustLightness(pr, -18));

  return {
    home: {
      wall: { style: 'gradient', palette: [wallBase, homeWallWarm] },
      floor: { style: 'wood', palette: [homeWoodBase, homeWoodAccent], variant: 'wide' },
    },
    kitchen: {
      wall: { style: 'solid', palette: [wallBase, kitchenWallAccent] },
      floor: { style: 'tile', palette: [kitchenTileBase, kitchenTileGrout] },
    },
    care: {
      wall: { style: 'solid', palette: [careWallBase, careWallAccent] },
      floor: { style: 'tile', palette: [careTileBase, careTileGrout], angle: 45 },
    },
    rest: {
      wall: { style: 'gradient', palette: [wallBase, restWallEnd] },
      floor: { style: 'carpet', palette: [restCarpetBase, restCarpetAccent], variant: 'soft' },
    },
    closet: {
      wall: { style: 'solid', palette: [wallBase, closetWallAccent] },
      floor: { style: 'wood', palette: [closetWoodBase, closetWoodAccent], variant: 'medium' },
    },
  };
}
