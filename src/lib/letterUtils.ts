import { FONT_OPTIONS } from '@/lib/letterTypes';
import { loadBundledFont } from '@/lib/fonts';

/**
 * Resolve the effective font-family string for a letter.
 *
 * If the user has selected a non-default font, that takes priority.
 * Otherwise the stationery's themeFont is used.
 * Falls back to the default font if neither is set.
 */
export function resolveFont(
  selectedFamily: string,
  themeFont: string | undefined,
): string {
  const defaultFamily = FONT_OPTIONS[0].family;
  const rawFont = selectedFamily !== defaultFamily ? selectedFamily : themeFont;
  if (!rawFont) return defaultFamily;
  return rawFont.includes(',') ? rawFont : `${rawFont}, ${defaultFamily}`;
}

/**
 * Ensure all bundled fonts referenced in a CSS font-family string are loaded.
 * Parses the comma-separated list, strips quotes/whitespace, and calls
 * loadBundledFont for each segment. No-ops for already-loaded or unknown fonts.
 */
export function ensureLetterFonts(cssFontFamily: string | undefined): void {
  if (!cssFontFamily) return;
  const families = cssFontFamily.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  for (const family of families) {
    if (family) loadBundledFont(family);
  }
}
