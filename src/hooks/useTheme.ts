import { type Theme } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useRef, useCallback } from "react";
import { themes, buildThemeCss, resolveTheme } from "@/themes";

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
    // Disable all transitions while swapping theme to prevent animated flicker
    const noTransition = document.createElement('style');
    noTransition.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.appendChild(noTransition);

    // Apply CSS vars synchronously before React re-renders to eliminate flicker
    const resolved = resolveTheme(theme);
    const css = buildThemeCss(themes[resolved] ?? themes.dark);
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