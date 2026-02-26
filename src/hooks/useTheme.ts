import { type Theme } from "@/contexts/AppContext";
import { type CoreThemeColors } from "@/themes";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useRef, useCallback } from "react";
import { builtinThemes, buildThemeCssFromCore, resolveTheme } from "@/themes";

/**
 * Hook to get and set the active theme.
 *
 * - `setTheme(theme)` switches between "light", "dark", "system", and "custom".
 * - `applyCustomTheme(colors)` sets theme to "custom" and applies the given core colors.
 *    Use this for presets and externally-sourced themes.
 */
export function useTheme() {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const debounceTimer = useRef<NodeJS.Timeout>();

  const syncToEncrypted = useCallback((patch: { theme?: Theme; customTheme?: CoreThemeColors }) => {
    if (!user) return;
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      updateSettings.mutateAsync(patch).catch((error) => {
        console.error('Failed to sync theme to encrypted storage:', error);
      });
    }, 1000);
  }, [user, updateSettings]);

  /** Switch to a builtin theme (light, dark, system) or to "custom" (preserving existing customTheme). */
  const setTheme = useCallback((theme: Theme) => {
    // Disable all transitions while swapping theme to prevent animated flicker
    const noTransition = document.createElement('style');
    noTransition.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.appendChild(noTransition);

    // Apply CSS vars synchronously before React re-renders to eliminate flicker
    const resolved = resolveTheme(theme);
    const colors = builtinThemes[resolved as keyof typeof builtinThemes] ?? builtinThemes.dark;
    const css = buildThemeCssFromCore(colors);
    let el = document.getElementById('theme-vars') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'theme-vars';
      document.head.appendChild(el);
    }
    el.textContent = css;
    document.documentElement.className = resolved;

    // Re-enable transitions after the browser has painted the new theme
    requestAnimationFrame(() => noTransition.remove());

    // Update local immediately
    updateConfig((currentConfig) => ({
      ...currentConfig,
      theme,
    }));
    syncToEncrypted({ theme });
  }, [updateConfig, syncToEncrypted]);

  /** Set theme to "custom" and apply the given core colors. */
  const applyCustomTheme = useCallback((colors: CoreThemeColors) => {
    updateConfig((currentConfig) => ({
      ...currentConfig,
      theme: 'custom' as Theme,
      customTheme: colors,
    }));
    syncToEncrypted({ theme: 'custom', customTheme: colors });
  }, [updateConfig, syncToEncrypted]);

  return {
    theme: config.theme,
    customTheme: config.customTheme,
    setTheme,
    applyCustomTheme,
  };
}
