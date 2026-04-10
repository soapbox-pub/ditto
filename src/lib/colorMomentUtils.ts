import { hexToHslString, hexToRgb, rgbToHsl, hslToRgb, getLuminance, getContrastRatio, parseHsl, formatHsl, hexLuminance } from '@/lib/colorUtils';
import type { CoreThemeColors } from '@/themes';

/** Extract validated hex color values from event tags. */
export function getColors(tags: string[][]): string[] {
  return tags
    .filter(([n]) => n === 'c')
    .map(([, v]) => v)
    .filter((v) => /^#[0-9A-Fa-f]{6}$/.test(v));
}

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
export function paletteToTheme(colors: string[]): CoreThemeColors {
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
    // Pick white or black -- whichever contrasts better
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
