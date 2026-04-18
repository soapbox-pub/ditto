import type { ThemeTokens } from '@/themes';
import type { CoreThemeColors } from '@/themes';

// ─── Conversion Utilities ────────────────────────────────────────────

/** Parse an HSL string like "228 20% 10%" into { h, s, l } */
export function parseHsl(hsl: string): { h: number; s: number; l: number } {
  const parts = hsl.trim().replace(/%/g, '').split(/\s+/).map(Number);
  return { h: parts[0], s: parts[1], l: parts[2] };
}

/** Format { h, s, l } back to "228 20% 10%" */
export function formatHsl(h: number, s: number, l: number): string {
  return `${Math.round(h * 10) / 10} ${Math.round(s * 10) / 10}% ${Math.round(l * 10) / 10}%`;
}

/** Convert HSL to RGB. h in [0,360], s,l in [0,100]. Returns [r,g,b] each [0,255]. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Convert RGB [0,255] to HSL { h, s, l } (h in degrees, s/l in percent). */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** Check whether a string looks like a valid hex color (#RGB, #RRGGBB, or without #). */
export function isValidHex(hex: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);
}

/** Convert hex color (#RRGGBB or #RGB) to RGB. */
export function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** Convert RGB to hex (#rrggbb). */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Convert hex to HSL string like "228 20% 10%". */
export function hexToHslString(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  return formatHsl(h, s, l);
}

/** Convert HSL string like "228 20% 10%" to hex. */
export function hslStringToHex(hsl: string): string {
  const { h, s, l } = parseHsl(hsl);
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// ─── Luminance & Contrast ─────────────────────────────────────────────

/** Relative luminance per WCAG 2.1 (0 = black, 1 = white). */
export function getLuminance(r: number, g: number, b: number): number {
  const sRGB = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/** WCAG contrast ratio between two colors (each as [r,g,b]). */
export function getContrastRatio(
  rgb1: [number, number, number],
  rgb2: [number, number, number],
): number {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Get contrast ratio between two HSL strings. */
export function getContrastRatioHsl(hsl1: string, hsl2: string): number {
  const c1 = parseHsl(hsl1);
  const c2 = parseHsl(hsl2);
  return getContrastRatio(hslToRgb(c1.h, c1.s, c1.l), hslToRgb(c2.h, c2.s, c2.l));
}

// ─── Dark/Light Detection ─────────────────────────────────────────────

/** Determine if an HSL background string represents a "dark" theme. */
export function isDarkTheme(backgroundHsl: string): boolean {
  const { h, s, l } = parseHsl(backgroundHsl);
  const [r, g, b] = hslToRgb(h, s, l);
  return getLuminance(r, g, b) < 0.2;
}

/** Resolve the live --background CSS variable to `"dark"` or `"light"`. */
export function getBackgroundThemeMode(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'light';
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--background')
    .trim();
  if (!bg) return 'light';
  return isDarkTheme(bg) ? 'dark' : 'light';
}

/** Resolve the live --background CSS variable to a hex color, or `null`. */
export function getBackgroundHex(): string | null {
  if (typeof document === 'undefined') return null;
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--background')
    .trim();
  if (!bg) return null;
  const { h, s, l } = parseHsl(bg);
  if ([h, s, l].some(isNaN)) return null;
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// ─── Adjust HSL helpers ───────────────────────────────────────────────

/** Lighten an HSL string by a given amount (0-100). */
function lighten(hsl: string, amount: number): string {
  const { h, s, l } = parseHsl(hsl);
  return formatHsl(h, s, Math.min(100, l + amount));
}

/** Darken an HSL string by a given amount (0-100). */
function darken(hsl: string, amount: number): string {
  const { h, s, l } = parseHsl(hsl);
  return formatHsl(h, s, Math.max(0, l - amount));
}

/** Get a contrast foreground (white or dark) for a given background. */
function contrastForeground(bgHsl: string): string {
  const dark = isDarkTheme(bgHsl);
  return dark ? '0 0% 100%' : '222.2 84% 4.9%';
}

// ─── Auto-Derive Full Token Set from Core Colors ──────────────────────

/**
 * Derive all Tailwind theme tokens from 3 core colors.
 * The Tailwind "accent" token mirrors "primary".
 *
 * @param background - Background HSL string
 * @param text       - Text/foreground HSL string
 * @param primary    - Primary accent HSL string (also used as Tailwind accent)
 */
export function deriveTokensFromCore(
  background: string,
  text: string,
  primary: string,
): ThemeTokens {
  const dark = isDarkTheme(background);

  // Surface colors derived from background
  const card = dark ? lighten(background, 2) : background;
  const popover = dark ? lighten(background, 2) : background;
  const secondarySurface = dark ? lighten(background, 8) : darken(background, 4);
  const muted = dark ? lighten(background, 8) : darken(background, 4);
  const border = dark ? formatHsl(parseHsl(primary).h, parseHsl(primary).s * 0.4, 30) : formatHsl(parseHsl(primary).h, parseHsl(primary).s * 0.5, 82);
  const input = border;

  // Muted foreground: a dimmer version of the main text color
  const fgParsed = parseHsl(text);
  const mutedFg = dark
    ? formatHsl(fgParsed.h, Math.max(fgParsed.s - 20, 0), Math.max(fgParsed.l - 30, 40))
    : formatHsl(fgParsed.h, Math.max(fgParsed.s - 30, 0), Math.min(fgParsed.l + 35, 55));

  // Foreground variants
  const cardFg = text;
  const popoverFg = text;
  const secondarySurfaceFg = text;

  // Primary/accent foregrounds: auto-contrast
  const primaryFg = contrastForeground(primary);

  // Destructive: standard red
  const destructive = dark ? '0 72% 51%' : '0 84.2% 60.2%';
  const destructiveFg = dark ? '0 0% 95%' : '210 40% 98%';

  return {
    background,
    foreground: text,
    card,
    cardForeground: cardFg,
    popover,
    popoverForeground: popoverFg,
    primary,
    primaryForeground: primaryFg,
    secondary: secondarySurface,
    secondaryForeground: secondarySurfaceFg,
    muted,
    mutedForeground: mutedFg,
    accent: primary,
    accentForeground: primaryFg,
    destructive,
    destructiveForeground: destructiveFg,
    border,
    input,
    ring: primary,
  };
}

/**
 * Extract CoreThemeColors from a legacy ThemeTokens object.
 * Used for backward compatibility when reading old configs/events
 * that stored the full 19-token set.
 */
export function tokensToCoreColors(tokens: ThemeTokens): CoreThemeColors {
  return {
    background: tokens.background,
    text: tokens.foreground,
    primary: tokens.primary,
  };
}

// ─── Hex color manipulation ───────────────────────────────────────────

/** Darken a hex color by a factor (0 = no change, 1 = black). */
export function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const dark = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  return rgbToHex(dark(r), dark(g), dark(b));
}

/** Lighten a hex color by a factor (0 = no change, 1 = white). */
export function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const light = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return rgbToHex(light(r), light(g), light(b));
}

/** Blend two hex colors by a factor (0 = hex1, 1 = hex2). */
export function blendHex(hex1: string, hex2: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * amount),
    Math.round(g1 + (g2 - g1) * amount),
    Math.round(b1 + (b2 - b1) * amount),
  );
}

// ─── Letter stationery color utilities ────────────────────────────────

/** WCAG 2.1 relative luminance of a hex color (0 = black, 1 = white). */
export function hexLuminance(hex: string): number {
  if (!hex) return 0.5;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Derive a readable text color for a given palette of hex colors.
 * avgLum > 0.5 → dark text; avgLum ≤ 0.5 → light text
 */
export function paletteTextColor(colors: string[]): string {
  if (colors.length === 0) return 'rgba(0,0,0,0.75)';
  const avg = colors.reduce((sum, c) => sum + hexLuminance(c), 0) / colors.length;
  return avg > 0.5 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.90)';
}

/** Derive a readable text color for a single background hex color. */
export function backgroundTextColor(bgHex: string): string {
  return hexLuminance(bgHex) > 0.5
    ? 'rgba(0,0,0,0.75)'
    : 'rgba(255,255,255,0.90)';
}

/** Faint text color for secondary elements (palette version). */
export function paletteTextColorFaint(colors: string[]): string {
  if (colors.length === 0) return 'rgba(0,0,0,0.30)';
  const avg = colors.reduce((sum, c) => sum + hexLuminance(c), 0) / colors.length;
  return avg > 0.5 ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.35)';
}

/** Faint text color for secondary elements (single background version). */
export function backgroundTextColorFaint(bgHex: string): string {
  return hexLuminance(bgHex) > 0.5
    ? 'rgba(0,0,0,0.30)'
    : 'rgba(255,255,255,0.35)';
}

/** Ruled-line color for letter stationery (palette version). */
export function paletteLineColor(colors: string[]): string {
  if (colors.length === 0) return 'rgba(0,0,0,0.08)';
  const avg = colors.reduce((sum, c) => sum + hexLuminance(c), 0) / colors.length;
  return avg > 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)';
}

/** Ruled-line color for letter stationery (single background version). */
export function backgroundLineColor(bgHex: string): string {
  return hexLuminance(bgHex) > 0.5
    ? 'rgba(0,0,0,0.08)'
    : 'rgba(255,255,255,0.15)';
}
