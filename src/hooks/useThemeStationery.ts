import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useAppContext } from '@/hooks/useAppContext';
import { builtinThemes, resolveTheme, resolveThemeConfig } from '@/themes';
import { hslStringToHex } from '@/lib/colorUtils';
import type { Stationery } from '@/lib/letterTypes';

/**
 * Converts the user's currently active Ditto theme into a letter Stationery.
 *
 * The mapping:
 *   - Stationery.color      ← theme background color (hex)
 *   - Stationery.textColor  ← theme text/foreground color (hex)
 *   - Stationery.primaryColor ← theme primary color (hex)
 *   - Stationery.imageUrl   ← theme background image URL (if any)
 *   - Stationery.imageMode  ← theme background mode (cover/tile)
 *   - Stationery.fontFamily ← theme body font-family (if any)
 *
 * This lets letters inherit the user's full Ditto theme — colors, fonts,
 * and background image — as their default stationery, so letters look
 * native to the user's chosen aesthetic.
 */
export function useThemeStationery(): Stationery {
  const { theme, customTheme, themes } = useTheme();
  const { config } = useAppContext();

  return useMemo(() => {
    const resolved = resolveTheme(theme);

    let bgHex: string;
    let textHex: string;
    let primaryHex: string;
    let fontFamily: string | undefined;
    let imageUrl: string | undefined;
    let imageMode: 'cover' | 'tile' | undefined;

    if (resolved === 'custom' && customTheme) {
      const { colors, font, background } = customTheme;
      bgHex      = hslStringToHex(colors.background);
      textHex    = hslStringToHex(colors.text);
      primaryHex = hslStringToHex(colors.primary);
      fontFamily = font?.family ?? undefined;
      imageUrl   = background?.url ?? undefined;
      imageMode  = background?.mode ?? undefined;
    } else {
      const colors = resolveThemeConfig(resolved as 'light' | 'dark', themes ?? config.themes).colors
        ?? builtinThemes[resolved as 'light' | 'dark'];
      bgHex      = hslStringToHex(colors.background);
      textHex    = hslStringToHex(colors.text);
      primaryHex = hslStringToHex(colors.primary);
    }

    return {
      color:        bgHex,
      textColor:    textHex,
      primaryColor: primaryHex,
      ...(fontFamily ? { fontFamily } : {}),
      ...(imageUrl   ? { imageUrl, imageMode: imageMode ?? 'cover' } : {}),
    };
  }, [theme, customTheme, themes, config.themes]);
}
