import { type Theme } from "@/contexts/AppContext";
import { type ThemeTokens } from "@/themes";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useRef, useCallback } from "react";

/**
 * Hook to get and set the active theme.
 *
 * - `setTheme(theme)` switches between "light", "dark", "system", and "custom".
 * - `applyCustomTheme(tokens)` sets theme to "custom" and applies the given tokens.
 *    Use this for presets and externally-sourced themes.
 */
export function useTheme() {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const debounceTimer = useRef<NodeJS.Timeout>();

  const syncToEncrypted = useCallback((patch: { theme?: Theme; customTheme?: ThemeTokens }) => {
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
    updateConfig((currentConfig) => ({
      ...currentConfig,
      theme,
    }));
    syncToEncrypted({ theme });
  }, [updateConfig, syncToEncrypted]);

  /** Set theme to "custom" and apply the given tokens. */
  const applyCustomTheme = useCallback((tokens: ThemeTokens) => {
    updateConfig((currentConfig) => ({
      ...currentConfig,
      theme: 'custom' as Theme,
      customTheme: tokens,
    }));
    syncToEncrypted({ theme: 'custom', customTheme: tokens });
  }, [updateConfig, syncToEncrypted]);

  return {
    theme: config.theme,
    customTheme: config.customTheme,
    setTheme,
    applyCustomTheme,
  };
}
