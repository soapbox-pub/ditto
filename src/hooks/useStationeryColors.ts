import { useMemo } from 'react';
import { type Stationery, resolveStationery } from '@/lib/letterTypes';
import {
  paletteTextColor,
  paletteTextColorFaint,
  paletteLineColor,
  backgroundTextColor,
  backgroundTextColorFaint,
  backgroundLineColor,
} from '@/lib/colorUtils';

/** Default stationery when none is provided */
const DEFAULT_STATIONERY: Stationery = { color: '#F5E6D3' };

/**
 * useStationeryColors
 *
 * Returns the correct text colors to render over a given stationery:
 *
 *   - Has textColor:  use it directly (theme)
 *   - Has colors[]:   WCAG avg-luminance of palette (color moment)
 *   - Otherwise:      WCAG luminance of the single background color (preset)
 *
 * Returns { text, faint, line } as CSS color strings for use in `style={{ color }}`.
 */
export function useStationeryColors(stationery?: Stationery): {
  text: string;
  faint: string;
  line: string;
  fontFamily?: string;
} {
  const raw = stationery ?? DEFAULT_STATIONERY;

  return useMemo(() => {
    const s = resolveStationery(raw);

    // Explicit text color (theme)
    if (s.textColor) {
      const line = backgroundLineColor(s.color);
      return {
        text: s.textColor,
        faint: s.textColor + '4d',
        line,
        fontFamily: s.fontFamily,
      };
    }

    // Color moment: avg WCAG luminance of palette
    if (s.colors && s.colors.length > 0) {
      return {
        text:  paletteTextColor(s.colors),
        faint: paletteTextColorFaint(s.colors),
        line:  paletteLineColor(s.colors),
        fontFamily: s.fontFamily,
      };
    }

    // Preset or fallback: single background color
    return {
      text:  backgroundTextColor(s.color),
      faint: backgroundTextColorFaint(s.color),
      line:  backgroundLineColor(s.color),
      fontFamily: s.fontFamily,
    };
  }, [raw]);
}
