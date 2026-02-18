import { type Theme } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * Hook to get and set the active theme
 * @returns Theme context with theme and setTheme
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();

  return {
    theme: config.theme,
    setTheme: (theme: Theme) => {
      // Update local immediately
      updateConfig((currentConfig) => ({
        ...currentConfig,
        theme,
      }));
      
      // Sync to encrypted storage if logged in (fire and forget)
      if (user) {
        updateSettings.mutateAsync({ theme }).catch((error) => {
          console.error('Failed to sync theme to encrypted storage:', error);
        });
      }
    }
  }
}