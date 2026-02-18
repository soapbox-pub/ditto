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
    setTheme: async (theme: Theme) => {
      // Update local immediately
      updateConfig((currentConfig) => ({
        ...currentConfig,
        theme,
      }));
      
      // Sync to encrypted storage if logged in
      if (user) {
        await updateSettings.mutateAsync({ theme });
      }
    }
  }
}