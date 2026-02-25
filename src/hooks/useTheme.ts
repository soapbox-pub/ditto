import { type Theme } from "@/contexts/AppContext";
import type { ThemeTokens } from "@/themes";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useRef, useCallback } from "react";

/**
 * Hook to get and set the active theme.
 * Supports both built-in presets and custom user-defined themes.
 */
export function useTheme() {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const debounceTimer = useRef<NodeJS.Timeout>();

  const setTheme = useCallback((theme: Theme) => {
    // Update local immediately
    updateConfig((currentConfig) => ({
      ...currentConfig,
      theme,
    }));
    
    // Debounce encrypted settings sync - only save after user stops changing theme
    if (user) {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      
      debounceTimer.current = setTimeout(() => {
        updateSettings.mutateAsync({ theme }).catch((error) => {
          console.error('Failed to sync theme to encrypted storage:', error);
        });
      }, 1000);
    }
  }, [user, updateConfig, updateSettings]);

  /** Set a custom theme. Automatically switches to "custom" mode. */
  const setCustomTheme = useCallback((tokens: ThemeTokens) => {
    // Update local immediately: set both custom tokens and switch to custom mode
    updateConfig((currentConfig) => ({
      ...currentConfig,
      theme: 'custom' as Theme,
      customTheme: tokens,
    }));

    // Debounce encrypted settings sync
    if (user) {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        updateSettings.mutateAsync({
          theme: 'custom' as Theme,
          customTheme: tokens,
        }).catch((error) => {
          console.error('Failed to sync custom theme to encrypted storage:', error);
        });
      }, 1000);
    }
  }, [user, updateConfig, updateSettings]);

  return {
    theme: config.theme,
    customTheme: config.customTheme,
    setTheme,
    setCustomTheme,
  };
}