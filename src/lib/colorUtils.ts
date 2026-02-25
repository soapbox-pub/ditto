import type { ThemeTokens } from '@/themes';

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

/** Desaturate an HSL string by a given amount (0-100). */
function desaturate(hsl: string, amount: number): string {
  const { h, s, l } = parseHsl(hsl);
  return formatHsl(h, Math.max(0, s - amount), l);
}

/** Get a contrast foreground (white or dark) for a given background. */
function contrastForeground(bgHsl: string): string {
  const dark = isDarkTheme(bgHsl);
  return dark ? '0 0% 100%' : '222.2 84% 4.9%';
}

// ─── Auto-Derive Full Token Set from Core Colors ──────────────────────

/**
 * Derive all 28 theme tokens from 4 core colors.
 * Intelligently adjusts derived tokens based on whether the background is dark or light.
 */
export function deriveTokensFromCore(
  background: string,
  foreground: string,
  primary: string,
  accent: string,
): ThemeTokens {
  const dark = isDarkTheme(background);

  // Surface colors derived from background
  const card = dark ? lighten(background, 2) : background;
  const popover = dark ? lighten(background, 2) : background;
  const secondary = dark ? lighten(background, 8) : darken(background, 4);
  const muted = dark ? lighten(background, 8) : darken(background, 4);
  const border = dark ? lighten(background, 10) : darken(desaturate(background, 20), 9);
  const input = border;

  // Muted foreground: a dimmer version of the main foreground
  const fgParsed = parseHsl(foreground);
  const mutedFg = dark
    ? formatHsl(fgParsed.h, Math.max(fgParsed.s - 20, 0), Math.max(fgParsed.l - 30, 40))
    : formatHsl(fgParsed.h, Math.max(fgParsed.s - 30, 0), Math.min(fgParsed.l + 35, 55));

  // Foreground variants
  const cardFg = foreground;
  const popoverFg = foreground;
  const secondaryFg = foreground;

  // Primary/accent foregrounds: auto-contrast
  const primaryFg = contrastForeground(primary);
  const accentFg = contrastForeground(accent);

  // Destructive: standard red
  const destructive = dark ? '0 72% 51%' : '0 84.2% 60.2%';
  const destructiveFg = dark ? '0 0% 95%' : '210 40% 98%';

  return {
    background,
    foreground,
    card,
    cardForeground: cardFg,
    popover,
    popoverForeground: popoverFg,
    primary,
    primaryForeground: primaryFg,
    secondary,
    secondaryForeground: secondaryFg,
    muted,
    mutedForeground: mutedFg,
    accent,
    accentForeground: accentFg,
    destructive,
    destructiveForeground: destructiveFg,
    border,
    input,
    ring: primary,
  };
}
