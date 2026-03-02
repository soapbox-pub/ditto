import { type Theme } from "@/contexts/AppContext";
import { type CoreThemeColors, type ThemeConfig } from "@/themes";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { usePublishTheme } from "@/hooks/usePublishTheme";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useRef, useCallback } from "react";
import { builtinThemes, buildThemeCssFromCore, resolveTheme, resolveThemeConfig } from "@/themes";

/**
 * Hook to get and set the active theme.
 *
 * - `setTheme(theme)` switches between "light", "dark", "system", and "custom".
 * - `applyCustomTheme(config)` sets theme to "custom" and applies the given ThemeConfig.
 *    Use this for presets and externally-sourced themes.
 *    Also accepts bare CoreThemeColors for backward compatibility.
 */
export function useTheme() {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { setActiveTheme } = usePublishTheme();
  const { user } = useCurrentUser();
  const debounceTimer = useRef<NodeJS.Timeout>();
  const autoPublishTimer = useRef<NodeJS.Timeout>();

  const syncToEncrypted = useCallback((patch: { theme?: Theme; customTheme?: ThemeConfig }) => {
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

  /** Debounced auto-publish of the custom theme to profile (kind 16767). */
  const autoPublishTheme = useCallback((themeConfig: ThemeConfig) => {
    if (!user || !config.autoShareTheme) return;
    if (autoPublishTimer.current) {
      clearTimeout(autoPublishTimer.current);
    }
    autoPublishTimer.current = setTimeout(() => {
      setActiveTheme({ themeConfig }).catch((error) => {
        console.error('Failed to auto-publish theme to profile:', error);
      });
    }, 2000);
  }, [user, config.autoShareTheme, setActiveTheme]);

  /** Switch to a builtin theme (light, dark, system) or to "custom" (preserving existing customTheme). */
  const setTheme = useCallback((theme: Theme) => {
    // Disable all transitions while swapping theme to prevent animated flicker
    const noTransition = document.createElement('style');
    noTransition.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.appendChild(noTransition);

    // Apply CSS vars synchronously before React re-renders to eliminate flicker
    const resolved = resolveTheme(theme);
    const colors = resolved === 'custom'
      ? (config.customTheme?.colors ?? builtinThemes.dark)
      : resolveThemeConfig(resolved, config.themes).colors;
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

    // Update local immediately — also clear any background from customTheme
    updateConfig((currentConfig) => ({
      ...currentConfig,
      theme,
      customTheme: currentConfig.customTheme
        ? { ...currentConfig.customTheme, background: undefined }
        : undefined,
    }));
    syncToEncrypted({ theme });
  }, [config.themes, config.customTheme?.colors, updateConfig, syncToEncrypted]);

  /**
   * Set theme to "custom" and apply the given theme config.
   * Accepts either ThemeConfig or bare CoreThemeColors (for backward compat).
   */
  const applyCustomTheme = useCallback((input: ThemeConfig | CoreThemeColors) => {
    // Normalize: if it looks like bare CoreThemeColors (has 'background' but no 'colors'), wrap it
    const themeConfig: ThemeConfig = 'colors' in input ? input : { colors: input };

    // Explicitly clear background if the new theme doesn't specify one,
    // so switching from a background preset to a non-background theme cleans up.
    const normalizedConfig: ThemeConfig = {
      ...themeConfig,
      background: themeConfig.background ?? undefined,
    };

    updateConfig((currentConfig) => ({
      ...currentConfig,
      theme: 'custom' as Theme,
      customTheme: normalizedConfig,
    }));
    syncToEncrypted({ theme: 'custom', customTheme: normalizedConfig });
    autoPublishTheme(normalizedConfig);
  }, [updateConfig, syncToEncrypted, autoPublishTheme]);

  /** Update the autoShareTheme setting. */
  const setAutoShareTheme = useCallback((enabled: boolean) => {
    updateConfig((currentConfig) => ({
      ...currentConfig,
      autoShareTheme: enabled,
    }));
    if (user) {
      updateSettings.mutateAsync({ autoShareTheme: enabled }).catch((error) => {
        console.error('Failed to sync autoShareTheme to encrypted storage:', error);
      });
    }
  }, [user, updateConfig, updateSettings]);

  return {
    theme: config.theme,
    customTheme: config.customTheme,
    themes: config.themes,
    autoShareTheme: config.autoShareTheme,
    setTheme,
    applyCustomTheme,
    setAutoShareTheme,
  };
}
