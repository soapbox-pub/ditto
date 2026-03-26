import { FONT_OPTIONS } from '@/lib/letterTypes';

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
