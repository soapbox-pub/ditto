import { type Theme } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useRef, useCallback } from "react";

/**
 * Hook to get and set the active theme
 * @returns Theme context with theme and setTheme
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
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

  return {
    theme: config.theme,
    setTheme,
  }
}